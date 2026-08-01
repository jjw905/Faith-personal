import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { TEAM_FEATURE_ADMIN_ONLY } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import {
  notifyMeetingScheduled,
  notifyPrivateConflict,
} from "@/lib/team/meeting-notifications";
import {
  accessibleMeetingIdsForUser,
  assertOnlineOnly,
  clampParticipantsToSeatLimit,
  findParticipantConflicts,
  guardScheduleConflicts,
  validateScheduleInput,
} from "@/lib/team/scheduling";
import {
  hasTeamCapability,
  requireTeamCapability,
  writeTeamAudit,
} from "@/lib/team-permissions";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

export async function GET(request: Request) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const url = new URL(request.url);
  const teamId = url.searchParams.get("teamId")?.trim();
  if (!teamId) {
    return NextResponse.json({ ok: false, message: "팀이 필요합니다." }, { status: 400 });
  }
  const member = await requireTeamCapability(teamId, session.user.id, "createMeeting").catch(
    () => null,
  );
  const membership = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: session.user.id } },
  });
  if (!membership) {
    return NextResponse.json({ ok: false, message: "팀을 찾을 수 없습니다." }, { status: 404 });
  }
  const meetings = await prisma.teamMeeting.findMany({
    where: {
      teamId,
      mode: "ONLINE",
      state: { in: ["SCHEDULED", "ACTIVE"] },
      canceledAt: null,
      OR: [
        { organizerId: session.user.id },
        { access: { some: { userId: session.user.id, isParticipant: true } } },
        ...(member || membership.role === "OWNER" || membership.role === "ADMIN"
          ? [{}]
          : []),
      ],
    },
    include: {
      organizer: { select: { id: true, name: true, handle: true } },
      access: {
        where: { isParticipant: true },
        select: {
          userId: true,
          acknowledgedAt: true,
          joinedAt: true,
          user: { select: { id: true, name: true, handle: true } },
        },
      },
    },
    orderBy: [{ scheduledStartAt: "asc" }, { createdAt: "asc" }],
    take: 50,
  });
  return NextResponse.json({ ok: true, meetings, serverNow: new Date().toISOString() });
}

export async function POST(request: Request) {
  if (process.env.LIVEKIT_ENABLED !== "1") {
    return NextResponse.json(
      { ok: false, message: "음성 회의 기능은 현재 비활성화되어 있습니다." },
      { status: 503 },
    );
  }
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  let body: {
    teamId?: string;
    title?: string;
    mode?: string;
    scheduledStartAt?: string;
    durationMinutes?: number;
    organizerId?: string;
    participantIds?: string[];
    backupHostId?: string | null;
    startNow?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }

  const online = assertOnlineOnly(body.mode ?? "ONLINE");
  if (!online.ok) {
    return NextResponse.json({ ok: false, message: online.message }, { status: 400 });
  }

  const teamId = body.teamId?.trim();
  if (!teamId) {
    return NextResponse.json({ ok: false, message: "팀이 필요합니다." }, { status: 400 });
  }
  const actor = await requireTeamCapability(teamId, session.user.id, "createMeeting");
  if (!actor) {
    return NextResponse.json({ ok: false, message: "회의 생성 권한이 없습니다." }, { status: 403 });
  }

  const startNow = Boolean(body.startNow);
  const requestedOrganizerId = body.organizerId?.trim() || session.user.id;
  if (
    requestedOrganizerId !== session.user.id &&
    !hasTeamCapability(actor, "manageTeam")
  ) {
    return NextResponse.json(
      { ok: false, message: "다른 멤버를 주최자로 지정할 권한이 없습니다." },
      { status: 403 },
    );
  }
  const schedule = validateScheduleInput({
    title: body.title,
    scheduledStartAt:
      body.scheduledStartAt ??
      (startNow ? new Date().toISOString() : undefined),
    durationMinutes: body.durationMinutes ?? (startNow ? 60 : undefined),
    organizerId: requestedOrganizerId,
    participantIds: body.participantIds ?? [],
    backupHostId: body.backupHostId,
  });
  if (!schedule.ok) {
    return NextResponse.json({ ok: false, message: schedule.message }, { status: 400 });
  }

  const requested = clampParticipantsToSeatLimit(
    schedule.value.participantIds,
    schedule.value.organizerId,
    actor.team.seatLimit,
  );
  const validMembers = await prisma.teamMember.findMany({
    where: {
      teamId,
      userId: { in: requested },
      user: {
        disabled: false,
        ...(TEAM_FEATURE_ADMIN_ONLY ? { role: "ADMIN" } : {}),
      },
    },
    select: { userId: true },
  });
  const validIds = clampParticipantsToSeatLimit(
    validMembers.map((row) => row.userId),
    schedule.value.organizerId,
    actor.team.seatLimit,
  );
  if (!validIds.includes(schedule.value.organizerId)) {
    return NextResponse.json({ ok: false, message: "주최자는 팀 멤버여야 합니다." }, { status: 400 });
  }
  const otherInvitees = validIds.filter((id) => id !== schedule.value.organizerId);
  if (otherInvitees.length < 1) {
    return NextResponse.json(
      { ok: false, message: "함께할 팀원을 초대해 주세요." },
      { status: 400 },
    );
  }
  if (
    schedule.value.backupHostId &&
    !validIds.includes(schedule.value.backupHostId)
  ) {
    return NextResponse.json(
      { ok: false, message: "대리 주최자는 초대된 팀 멤버여야 합니다." },
      { status: 400 },
    );
  }

  const accessible = await accessibleMeetingIdsForUser(session.user.id);
  const meetingId = `tm-${randomUUID().slice(0, 12)}`;
  const roomName = `faith-${meetingId}`;
  const now = new Date();

  let privateNotices: Array<{ userId: string; meetingId: string }> = [];
  type ConflictVisible = Awaited<
    ReturnType<typeof findParticipantConflicts>
  >["visible"];
  let conflictVisible: ConflictVisible | null = null;

  const meeting = await prisma
    .$transaction(async (tx) => {
      const conflicts = await guardScheduleConflicts(tx, {
        participantIds: validIds,
        startMs: schedule.value.scheduledStartAt.getTime(),
        durationMinutes: schedule.value.durationMinutes,
        accessibleMeetingIds: accessible,
      });
      if (conflicts.blocked) {
        conflictVisible = conflicts.visible;
        throw new Error("SCHEDULE_CONFLICT");
      }
      privateNotices = conflicts.privateNotices;
      // 바로 시작도 입장 전(로비)에서는 SCHEDULED로 둬서 팀원 초대를
      // 바꿀 수 있게 한다. 주최자가 LiveKit에 입장하면 ACTIVE로 전환된다.
      return tx.teamMeeting.create({
        data: {
          id: meetingId,
          teamId,
          title: schedule.value.title,
          mode: "ONLINE",
          state: "SCHEDULED",
          livekitRoomName: roomName,
          createdById: session.user.id,
          organizerId: schedule.value.organizerId,
          backupHostId: schedule.value.backupHostId,
          currentHostId: schedule.value.organizerId,
          scheduledStartAt: schedule.value.scheduledStartAt,
          durationMinutes: schedule.value.durationMinutes,
          startedAt: null,
          hostPresentAt: null,
          access: {
            create: validIds.map((userId) => ({
              userId,
              isParticipant: true,
              canReadMasked: true,
              grantedById: session.user.id,
              acknowledgedAt:
                userId === schedule.value.organizerId ? now : null,
            })),
          },
        },
        include: {
          organizer: { select: { id: true, name: true, handle: true } },
          access: true,
        },
      });
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.message === "SCHEDULE_CONFLICT") {
        return null;
      }
      throw error;
    });

  if (!meeting) {
    return NextResponse.json(
      {
        ok: false,
        message: "일정이 겹칩니다.",
        conflicts: conflictVisible ?? [],
      },
      { status: 409 },
    );
  }

  await writeTeamAudit({
    teamId,
    actorId: session.user.id,
    meetingId: meeting.id,
    action: startNow ? "meeting.started" : "meeting.scheduled",
    metadata: {
      mode: "ONLINE",
      startNow,
      participantCount: validIds.length,
      scheduledStartAt: schedule.value.scheduledStartAt.toISOString(),
      durationMinutes: schedule.value.durationMinutes,
    },
    request,
  });

  await notifyMeetingScheduled({
    teamId,
    teamName: actor.team.name,
    meetingId: meeting.id,
    title: meeting.title,
    scheduledStartAt: schedule.value.scheduledStartAt,
    inviteeIds: validIds,
    organizerId: schedule.value.organizerId,
    startNow,
  });

  await Promise.all(
    privateNotices.map((notice) =>
      notifyPrivateConflict({
        userId: notice.userId,
        teamId,
        teamName: actor.team.name,
        meetingId: meeting.id,
      }),
    ),
  );

  return NextResponse.json(
    {
      ok: true,
      meeting,
      href: startNow
        ? `/meetings/team/${meeting.id}`
        : `/team?meeting=${meeting.id}`,
      serverNow: now.toISOString(),
    },
    { status: 201 },
  );
}
