import { timingSafeEqual } from "node:crypto";

import { OAuth2Client } from "google-auth-library";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";
import { purgeUntrackedObjects, storageBackend } from "@/lib/storage/object-store";
import {
  getTeamRetentionPreview,
  purgeExpiredTeamAuditLogs,
  purgeExpiredTeamMeetings,
} from "@/lib/team/retention";

type MaintenanceBody = {
  dryRun?: boolean;
  maxMeetings?: number;
  teamId?: string;
  purgeOrphanedObjects?: boolean;
  orphanGraceHours?: number;
  maxObjects?: number;
};

function bearerSecret(request: Request) {
  const value = request.headers.get("authorization")?.trim();
  if (!value?.startsWith("Bearer ")) return "";
  return value.slice("Bearer ".length).trim();
}

function maintenanceSecret(request: Request) {
  return (
    request.headers.get("x-faith-maintenance-secret")?.trim() ||
    bearerSecret(request)
  );
}

function secretsMatch(received: string, expected: string) {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

const googleOidcClient = new OAuth2Client();

async function schedulerOidcMatches(request: Request) {
  const audience = process.env.MAINTENANCE_CRON_AUDIENCE?.trim();
  const serviceAccount = process.env.MAINTENANCE_CRON_SERVICE_ACCOUNT?.trim();
  const token = bearerSecret(request);
  if (!audience || !serviceAccount || !token) return false;
  try {
    const ticket = await googleOidcClient.verifyIdToken({
      idToken: token,
      audience,
    });
    const payload = ticket.getPayload();
    return (
      payload?.email === serviceAccount && payload.email_verified === true
    );
  } catch {
    return false;
  }
}

async function authorize(request: Request) {
  const expected = process.env.MAINTENANCE_CRON_SECRET?.trim();
  if (expected && secretsMatch(maintenanceSecret(request), expected)) {
    return { kind: "scheduler" as const, actorId: null };
  }
  if (await schedulerOidcMatches(request)) {
    return { kind: "scheduler" as const, actorId: null };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return {
      kind: "unauthenticated" as const,
      actorId: null,
      status: 401 as const,
    };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabled: true },
  });
  if (!user || user.disabled || user.role !== "ADMIN") {
    return {
      kind: "forbidden" as const,
      actorId: null,
      status: 403 as const,
    };
  }
  return { kind: "admin" as const, actorId: session.user.id };
}

export async function POST(request: Request) {
  const gate = await authorize(request);
  if (gate.kind === "unauthenticated" || gate.kind === "forbidden") {
    return NextResponse.json(
      {
        ok: false,
        message:
          gate.status === 401 ? "로그인이 필요합니다." : "운영 관리자 권한이 필요합니다.",
      },
      { status: gate.status },
    );
  }

  let body: MaintenanceBody = {};
  try {
    const parsed = (await request.json()) as unknown;
    if (parsed && typeof parsed === "object") {
      body = parsed as MaintenanceBody;
    }
  } catch {
    // Empty POST is the normal scheduler form.
  }

  const teamId =
    typeof body.teamId === "string" && body.teamId.trim()
      ? body.teamId.trim()
      : undefined;
  const maxMeetings =
    typeof body.maxMeetings === "number" &&
    Number.isFinite(body.maxMeetings)
      ? body.maxMeetings
      : undefined;
  const now = new Date();
  const result = await purgeExpiredTeamMeetings({
    teamId,
    now,
    dryRun: body.dryRun === true,
    maxMeetings,
  });
  let storageCleanup:
    | {
        supported: boolean;
        scanned: number;
        candidates: number;
        deleted: number;
        failed: number;
        dryRun: boolean;
        error?: string;
      }
    | { skipped: true; reason: string };
  if (body.purgeOrphanedObjects === false || storageBackend() !== "gcs") {
    storageCleanup = {
      skipped: true,
      reason:
        body.purgeOrphanedObjects === false
          ? "disabled"
          : "storage_backend_not_gcs",
    };
  } else {
    const graceHours = Math.min(
      168,
      Math.max(
        1,
        Number.isFinite(body.orphanGraceHours)
          ? Math.floor(body.orphanGraceHours!)
          : 24,
      ),
    );
    const maxObjects = Math.min(
      2_000,
      Math.max(
        1,
        Number.isFinite(body.maxObjects)
          ? Math.floor(body.maxObjects!)
          : 500,
      ),
    );
    try {
      const files = await prisma.vaultFile.findMany({
        select: { key: true },
      });
      storageCleanup = await purgeUntrackedObjects({
        referencedKeys: new Set(files.map((file) => file.key)),
        olderThan: new Date(Date.now() - graceHours * 60 * 60 * 1000),
        maxDeletes: maxObjects,
        dryRun: body.dryRun === true,
      });
    } catch {
      storageCleanup = {
        supported: true,
        scanned: 0,
        candidates: 0,
        deleted: 0,
        failed: 1,
        dryRun: body.dryRun === true,
        error: "object_storage_cleanup_failed",
      };
    }
  }
  let deletedAuditLogs = 0;
  if (!body.dryRun) {
    const purgedAudit = await purgeExpiredTeamAuditLogs({ teamId, now });
    deletedAuditLogs = purgedAudit.deleted;
  }
  const retention = {
    ...result,
    deletedAuditLogs,
  };

  if (gate.kind === "admin") {
    await writeAdminAudit({
      actorId: gate.actorId,
      action: "maintenance.team_retention",
      metadata: {
        dryRun: retention.dryRun,
        teamId: teamId ?? null,
        candidateMeetings: retention.candidateMeetings,
        deletedMeetings: retention.deletedMeetings,
        deletedAuditLogs: retention.deletedAuditLogs,
        failedTeams: retention.failedTeams.length,
        storageCleanup:
          "skipped" in storageCleanup
            ? storageCleanup
            : {
                scanned: storageCleanup.scanned,
                candidates: storageCleanup.candidates,
                deleted: storageCleanup.deleted,
                failed: storageCleanup.failed,
                error: storageCleanup.error ?? null,
              },
      },
      request,
    });
  }

  const storageCleanupFailed =
    !("skipped" in storageCleanup) &&
    (storageCleanup.failed > 0 || Boolean(storageCleanup.error));
  return NextResponse.json({
    ok: retention.failedTeams.length === 0 && !storageCleanupFailed,
    message:
      retention.failedTeams.length === 0 && !storageCleanupFailed
        ? retention.dryRun
          ? "보존 작업 대상을 확인했습니다."
          : "보존 작업을 완료했습니다."
        : "일부 팀의 보존 작업을 완료하지 못했습니다.",
    source: gate.kind,
    retention,
    storageCleanup,
    preview: await getTeamRetentionPreview({ teamId, now }),
  }, {
    status: retention.failedTeams.length > 0 || storageCleanupFailed ? 207 : 200,
  });
}
