import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";
import {
  getTeamRetentionPreview,
  purgeExpiredTeamAuditLogs,
  purgeExpiredTeamMeetings,
} from "@/lib/team/retention";

type MaintenanceBody = {
  dryRun?: boolean;
  maxMeetings?: number;
  teamId?: string;
};

function bearerSecret(request: Request) {
  const value = request.headers.get("authorization")?.trim();
  if (!value?.startsWith("Bearer ")) return "";
  return value.slice("Bearer ".length).trim();
}

function secretsMatch(received: string, expected: string) {
  const receivedBytes = Buffer.from(received);
  const expectedBytes = Buffer.from(expected);
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

async function authorize(request: Request) {
  const expected = process.env.MAINTENANCE_CRON_SECRET?.trim();
  if (expected && secretsMatch(bearerSecret(request), expected)) {
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
      },
      request,
    });
  }

  return NextResponse.json({
    ok: retention.failedTeams.length === 0,
    message:
      retention.failedTeams.length === 0
        ? retention.dryRun
          ? "보존 작업 대상을 확인했습니다."
          : "보존 작업을 완료했습니다."
        : "일부 팀의 보존 작업을 완료하지 못했습니다.",
    source: gate.kind,
    retention,
    preview: await getTeamRetentionPreview({ teamId, now }),
  }, {
    status: retention.failedTeams.length > 0 ? 207 : 200,
  });
}
