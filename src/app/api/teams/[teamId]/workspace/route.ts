import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { openTeamText } from "@/lib/team-encryption";
import { listWorkspaceMeetingAcks } from "@/lib/notifications-store";
import { deriveMeetingState } from "@/lib/team/meeting-lifecycle";
import { reconcileTeamMeeting } from "@/lib/team/reconcile-meeting";
import { meetingCardStatus } from "@/lib/team/scheduling";
import { resolveEntryMicrophoneOn } from "@/lib/team/settings-precedence";
import { getTeamMember, hasTeamCapability } from "@/lib/team-permissions";
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

  const now = new Date();
  const [
    upcomingRaw,
    recentRecords,
    announcements,
    acks,
    pendingAccess,
    personal,
    members,
    auditCount,
  ] = await Promise.all([
    prisma.teamMeeting.findMany({
      where: {
        teamId,
        mode: "ONLINE",
        state: { in: ["SCHEDULED", "ACTIVE"] },
        canceledAt: null,
        OR: [
          {
            access: { some: { userId: session.user.id, isParticipant: true } },
          },
          { organizerId: session.user.id },
          ...(membership.role === "OWNER" || membership.role === "ADMIN"
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
            isParticipant: true,
            acknowledgedAt: true,
            joinedAt: true,
          },
        },
      },
      orderBy: [{ scheduledStartAt: "asc" }, { createdAt: "asc" }],
      take: 30,
    }),
    prisma.teamMeeting.findMany({
      where: {
        teamId,
        state: { in: ["ENDED", "READY", "PROCESSING"] },
        OR: [
          { organizerId: session.user.id },
          {
            access: {
              some: {
                userId: session.user.id,
                OR: [{ isParticipant: true }, { canReadMasked: true }],
              },
            },
          },
          ...(hasTeamCapability(membership, "manageRecordAccess") ? [{}] : []),
        ],
      },
      orderBy: { endedAt: "desc" },
      take: 12,
      select: {
        id: true,
        title: true,
        endedAt: true,
        state: true,
        durationMinutes: true,
      },
    }),
    prisma.teamAnnouncement.findMany({
      where: { teamId, archivedAt: null },
      include: {
        reads: { where: { userId: session.user.id }, take: 1 },
        author: { select: { id: true, name: true, handle: true } },
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 20,
    }),
    listWorkspaceMeetingAcks(session.user.id, teamId),
    prisma.teamMeetingAccess.findMany({
      where: {
        userId: session.user.id,
        acknowledgedAt: null,
        OR: [{ isParticipant: true }, { canReadMasked: true }],
        meeting: {
          teamId,
          state: { not: "CANCELED" },
        },
      },
      select: {
        meetingId: true,
        meeting: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.userPersonalSettings.findUnique({
      where: { userId: session.user.id },
    }),
    hasTeamCapability(membership, "manageTeam")
      ? prisma.teamMember.findMany({
          where: { teamId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                handle: true,
                image: true,
                disabled: true,
              },
            },
          },
          orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        })
      : Promise.resolve([]),
    hasTeamCapability(membership, "viewAudit")
      ? prisma.teamAuditLog.count({ where: { teamId } })
      : Promise.resolve(0),
  ]);

  await Promise.all(
    upcomingRaw.map((meeting) => reconcileTeamMeeting(meeting.id, now)),
  );

  const upcoming = upcomingRaw.map((meeting) => {
    const derived = deriveMeetingState(meeting, now);
    const myAccess = meeting.access.find(
      (row) => row.userId === session.user.id,
    );
    return {
      id: meeting.id,
      title: meeting.title,
      scheduledStartAt: meeting.scheduledStartAt,
      scheduledEndAt:
        meeting.scheduledStartAt && meeting.durationMinutes
          ? new Date(
              meeting.scheduledStartAt.getTime() +
                meeting.durationMinutes * 60_000,
            )
          : null,
      durationMinutes: meeting.durationMinutes,
      organizer: meeting.organizer,
      invitedCount: meeting.access.length,
      status: meetingCardStatus({
        state: meeting.state,
        canceledAt: meeting.canceledAt,
        derivedPhase: derived.phase,
      }),
      derived,
      acknowledged:
        Boolean(myAccess?.acknowledgedAt) ||
        meeting.organizerId === session.user.id,
      canJoin:
        derived.showJoinOnNearestCard &&
        Boolean(
          myAccess?.isParticipant || meeting.organizerId === session.user.id,
        ),
      acknowledgementStats: {
        invited: meeting.access.length,
        acknowledged: meeting.access.filter((row) => row.acknowledgedAt).length,
      },
    };
  });

  const nearest = upcoming.find((row) => row.derived.phase !== "ended") ?? null;

  const hideAfterRead = Boolean(
    membership.team.policy?.announcementHideAfterRead,
  );
  type UnconfirmedAlert = {
    notificationId: string | null;
    meetingId: string | null;
    title: string;
    body: string;
    createdAt: Date;
  };
  const unconfirmedByMeeting = new Map<string | null, UnconfirmedAlert>(
    acks.map((row) => [
      row.meetingId,
      {
        notificationId: row.id,
        meetingId: row.meetingId,
        title: row.title,
        body: row.body,
        createdAt: row.createdAt,
      },
    ]),
  );
  for (const access of pendingAccess) {
    if (unconfirmedByMeeting.has(access.meetingId)) continue;
    unconfirmedByMeeting.set(access.meetingId, {
      notificationId: null,
      meetingId: access.meetingId,
      title: "회의 확인이 필요합니다",
      body: access.meeting.title,
      createdAt: new Date(0),
    });
  }
  const unconfirmedAlerts = [...unconfirmedByMeeting.values()];
  const visibleAnnouncements = await Promise.all(
    announcements
      .filter((row) => {
        const read = row.reads[0];
        if (!read) return true;
        return !hideAfterRead;
      })
      .map(async (row) => ({
        id: row.id,
        title: await openTeamText(teamId, "content", row.title),
        body: await openTeamText(teamId, "content", row.body),
        pinned: row.pinned,
        createdAt: row.createdAt,
        author: row.author,
        read: Boolean(row.reads[0]),
      })),
  );

  const mic = resolveEntryMicrophoneOn({
    inTeamWorkspace: true,
    team: membership.team.policy
      ? { forceMicrophoneOff: membership.team.policy.forceMicrophoneOff }
      : null,
    personal: {
      defaultMicrophoneOn: personal?.defaultMicrophoneOn ?? false,
      preferredInputDeviceId: personal?.preferredInputDeviceId ?? null,
    },
  });

  return NextResponse.json({
    ok: true,
    serverNow: now.toISOString(),
    team: {
      id: membership.team.id,
      name: membership.team.name,
      ownerId: membership.team.ownerId,
      seatLimit: membership.team.seatLimit,
      memberCount: undefined,
      policy: membership.team.policy,
    },
    currentMember: {
      userId: membership.userId,
      role: membership.role,
      canInvite: membership.canInvite,
      canCreateMeeting: membership.canCreateMeeting,
      canManageRecordAccess: membership.canManageRecordAccess,
    },
    unconfirmedAlerts,
    nearest,
    upcoming,
    announcements: visibleAnnouncements,
    recentRecords,
    members,
    auditCount,
    micDefaults: mic,
    capabilities: {
      manageTeam: hasTeamCapability(membership, "manageTeam"),
      invite: hasTeamCapability(membership, "invite"),
      createMeeting: hasTeamCapability(membership, "createMeeting"),
      manageRecordAccess: hasTeamCapability(membership, "manageRecordAccess"),
      viewAudit: hasTeamCapability(membership, "viewAudit"),
      isOwner: membership.role === "OWNER",
      isLeader: membership.role === "ADMIN" || membership.role === "OWNER",
      isPlatformAdmin: session.user.role === "ADMIN",
    },
  });
}
