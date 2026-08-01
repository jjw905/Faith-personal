import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import {
  evaluateKmsProvisioningRuntime,
  kmsProvider,
} from "@/lib/kms-runtime-policy";
import { prisma } from "@/lib/prisma";
import {
  getTeamMember,
  hasTeamCapability,
  writeTeamAudit,
} from "@/lib/team-permissions";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function GET(_: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { teamId } = await context.params;
  const membership = await getTeamMember(teamId, session.user.id);
  if (!membership) {
    return NextResponse.json(
      { ok: false, message: "팀을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  const [members, invites, meetings, securityKey] = await Promise.all([
    prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            handle: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    }),
    hasTeamCapability(membership, "invite")
      ? prisma.teamInvite.findMany({
          where: { teamId, status: "PENDING" },
          include: {
            invitedUser: {
              select: { id: true, name: true, handle: true, image: true },
            },
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.teamMeeting.findMany({
      where: hasTeamCapability(membership, "manageRecordAccess")
        ? { teamId }
        : {
            teamId,
            OR: [
              { createdById: session.user.id },
              {
                access: {
                  some: { userId: session.user.id, canReadMasked: true },
                },
              },
            ],
          },
      include: hasTeamCapability(membership, "manageRecordAccess")
        ? {
            access: {
              select: {
                userId: true,
                isParticipant: true,
                canReadMasked: true,
              },
            },
          }
        : undefined,
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.teamSecurityKey.findUnique({
      where: { teamId },
      select: {
        status: true,
        provider: true,
        region: true,
        contentKeyArn: true,
        auditKeyArn: true,
        contentDataKeyCiphertext: true,
        auditDataKeyCiphertext: true,
        createdAt: true,
        lastError: true,
      },
    }),
  ]);
  const kmsProvisioning = evaluateKmsProvisioningRuntime();
  const activeProvider = kmsProvider();
  const expectedProvider =
    activeProvider === "gcp"
      ? "GCP"
      : activeProvider === "aws"
        ? "AWS"
        : null;
  const teamKmsReady = Boolean(
    kmsProvisioning.allowed &&
    expectedProvider &&
    securityKey?.status === "ACTIVE" &&
      securityKey.provider === expectedProvider &&
      securityKey.contentKeyArn &&
      securityKey.auditKeyArn &&
      securityKey.contentDataKeyCiphertext &&
      securityKey.auditDataKeyCiphertext,
  );
  return NextResponse.json({
    ok: true,
    team: {
      id: membership.team.id,
      name: membership.team.name,
      slug: membership.team.slug,
      ownerId: membership.team.ownerId,
      seatLimit: membership.team.seatLimit,
      policy: membership.team.policy,
    },
    currentMember: membership,
    members,
    invites,
    meetings,
    security: {
      encryptionManagedBy: "service",
      kmsReady: teamKmsReady,
      kmsReason: teamKmsReady
        ? null
        : securityKey?.status === "PROVISIONING"
          ? "provisioning"
          : securityKey?.status === "FAILED"
            ? "failed"
            : securityKey
              ? kmsProvisioning.allowed
                ? "missing_configuration"
                : kmsProvisioning.reason
              : "not_configured",
      kmsStatus: securityKey?.status ?? "NOT_CONFIGURED",
      kmsRegion: securityKey?.region ?? null,
      kmsCreatedAt: securityKey?.createdAt ?? null,
      kmsLastError: securityKey?.lastError ?? null,
      kmsProvisioningReady: kmsProvisioning.allowed,
      kmsProvisioningReason: kmsProvisioning.allowed
        ? null
        : kmsProvisioning.reason,
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { teamId } = await context.params;
  const membership = await getTeamMember(teamId, session.user.id);
  if (!membership || !hasTeamCapability(membership, "manageTeam")) {
    return NextResponse.json(
      { ok: false, message: "권한이 없습니다." },
      { status: 403 },
    );
  }
  let body: {
    name?: string;
    retentionDays?: number;
    allowAdminUnmask?: boolean;
    allowExternalSharing?: boolean;
    announcementHideAfterRead?: boolean;
    forceMicrophoneOff?: boolean;
    preHostRecordingDefault?: boolean;
    preHostRecordingLocked?: boolean;
    participationPolicy?: Record<string, unknown>;
    recordPolicy?: Record<string, unknown>;
    notificationPolicy?: Record<string, unknown>;
    schedulePolicy?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  const securityPatchRequested =
    body.retentionDays !== undefined ||
    typeof body.allowAdminUnmask === "boolean" ||
    typeof body.allowExternalSharing === "boolean" ||
    typeof body.announcementHideAfterRead === "boolean" ||
    typeof body.forceMicrophoneOff === "boolean" ||
    typeof body.preHostRecordingDefault === "boolean" ||
    typeof body.preHostRecordingLocked === "boolean" ||
    Boolean(body.participationPolicy) ||
    Boolean(body.recordPolicy) ||
    Boolean(body.notificationPolicy) ||
    Boolean(body.schedulePolicy);
  if (securityPatchRequested && membership.role !== "OWNER") {
    return NextResponse.json(
      { ok: false, message: "팀 보안 정책은 팀 대표만 변경할 수 있습니다." },
      { status: 403 },
    );
  }
  if (body.allowExternalSharing === true) {
    return NextResponse.json(
      {
        ok: false,
        code: "TEAM_EXTERNAL_SHARING_UNAVAILABLE",
        message:
          "외부 공유는 공개 열람 링크가 준비된 뒤 제공됩니다. 현재는 켤 수 없습니다.",
      },
      { status: 409 },
    );
  }
  const retentionDays = [30, 60, 90].includes(Number(body.retentionDays))
    ? Number(body.retentionDays)
    : undefined;
  const nameChanged = Boolean(body.name?.trim());
  const [team] = await prisma.$transaction([
    prisma.team.update({
      where: { id: teamId },
      data: body.name?.trim() ? { name: body.name.trim().slice(0, 50) } : {},
    }),
    prisma.teamPolicy.upsert({
      where: { teamId },
      create: {
        teamId,
        retentionDays: retentionDays ?? 90,
        allowAdminUnmask: body.allowAdminUnmask ?? true,
        allowExternalSharing: body.allowExternalSharing ?? false,
        announcementHideAfterRead: body.announcementHideAfterRead ?? false,
        forceMicrophoneOff: body.forceMicrophoneOff ?? false,
        preHostRecordingDefault: body.preHostRecordingDefault ?? false,
        preHostRecordingLocked: body.preHostRecordingLocked ?? false,
        participationPolicy: (body.participationPolicy ??
          {}) as Prisma.InputJsonValue,
        recordPolicy: (body.recordPolicy ?? {}) as Prisma.InputJsonValue,
        notificationPolicy: (body.notificationPolicy ??
          {}) as Prisma.InputJsonValue,
        schedulePolicy: (body.schedulePolicy ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        ...(retentionDays ? { retentionDays } : {}),
        ...(typeof body.allowAdminUnmask === "boolean"
          ? { allowAdminUnmask: body.allowAdminUnmask }
          : {}),
        ...(typeof body.allowExternalSharing === "boolean"
          ? { allowExternalSharing: body.allowExternalSharing }
          : {}),
        ...(typeof body.announcementHideAfterRead === "boolean"
          ? { announcementHideAfterRead: body.announcementHideAfterRead }
          : {}),
        ...(typeof body.forceMicrophoneOff === "boolean"
          ? { forceMicrophoneOff: body.forceMicrophoneOff }
          : {}),
        ...(typeof body.preHostRecordingDefault === "boolean"
          ? { preHostRecordingDefault: body.preHostRecordingDefault }
          : {}),
        ...(typeof body.preHostRecordingLocked === "boolean"
          ? { preHostRecordingLocked: body.preHostRecordingLocked }
          : {}),
        ...(body.participationPolicy
          ? {
              participationPolicy:
                body.participationPolicy as Prisma.InputJsonValue,
            }
          : {}),
        ...(body.recordPolicy
          ? { recordPolicy: body.recordPolicy as Prisma.InputJsonValue }
          : {}),
        ...(body.notificationPolicy
          ? {
              notificationPolicy:
                body.notificationPolicy as Prisma.InputJsonValue,
            }
          : {}),
        ...(body.schedulePolicy
          ? { schedulePolicy: body.schedulePolicy as Prisma.InputJsonValue }
          : {}),
      },
    }),
  ]);
  await writeTeamAudit({
    teamId,
    actorId: session.user.id,
    action: nameChanged ? "team.renamed" : "team.policy_updated",
    metadata: {
      name: team.name,
      retentionDays,
      allowAdminUnmask: body.allowAdminUnmask,
      allowExternalSharing: body.allowExternalSharing,
      announcementHideAfterRead: body.announcementHideAfterRead,
      forceMicrophoneOff: body.forceMicrophoneOff,
      preHostRecordingDefault: body.preHostRecordingDefault,
      preHostRecordingLocked: body.preHostRecordingLocked,
    },
    request,
  });
  return NextResponse.json({ ok: true, team });
}
