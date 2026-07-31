import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { prisma } from "@/lib/prisma";
import { deriveMeetingState, effectiveHostId } from "@/lib/team/meeting-lifecycle";
import { markParticipantJoined } from "@/lib/team/reconcile-meeting";
import { reconcileTeamMeeting } from "@/lib/team/reconcile-meeting";
import { resolveEntryMicrophoneOn } from "@/lib/team/settings-precedence";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

export async function POST(request: Request) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  let body: { teamMeetingId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.teamMeetingId) {
    return NextResponse.json({ ok: false, message: "회의 ID가 필요합니다." }, { status: 400 });
  }

  const meeting = await prisma.teamMeeting.findUnique({
    where: { id: body.teamMeetingId },
    include: {
      team: { include: { policy: true } },
      access: { where: { userId: session.user.id }, take: 1 },
      organizer: { select: { disabled: true } },
    },
  });
  const membership = meeting
    ? await prisma.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId: meeting.teamId,
            userId: session.user.id,
          },
        },
      })
    : null;
  const access = meeting?.access[0];
  if (
    !meeting ||
    !membership ||
    !(
      meeting.organizerId === session.user.id ||
      access?.isParticipant
    )
  ) {
    return NextResponse.json(
      { ok: false, message: "음성 회의 참가 권한이 없습니다." },
      { status: 403 },
    );
  }
  const reconciled = await reconcileTeamMeeting(body.teamMeetingId);
  const currentMeeting = reconciled?.meeting
    ? { ...meeting, ...reconciled.meeting }
    : meeting;
  const derived = deriveMeetingState(currentMeeting);
  const canJoin =
    currentMeeting.mode === "ONLINE" &&
    currentMeeting.state !== "CANCELED" &&
    currentMeeting.state !== "ENDED" &&
    currentMeeting.livekitRoomName &&
    derived?.canJoin &&
    (currentMeeting.organizerId === session.user.id || access?.isParticipant);

  if (!canJoin || !currentMeeting.livekitRoomName) {
    return NextResponse.json({ ok: false, message: "음성 회의 참가 권한이 없습니다." }, { status: 403 });
  }
  if (
    currentMeeting.organizerId !== session.user.id &&
    !currentMeeting.access[0]?.acknowledgedAt
  ) {
    return NextResponse.json(
      {
        ok: false,
        code: "MEETING_ACK_REQUIRED",
        message: "참석 확인 후 음성 회의에 입장할 수 있습니다.",
      },
      { status: 409 },
    );
  }

  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    return NextResponse.json({ ok: false, message: "음성 서버 설정이 필요합니다." }, { status: 503 });
  }

  await markParticipantJoined({
    meetingId: currentMeeting.id,
    userId: session.user.id,
  });

  const hostId = effectiveHostId(currentMeeting);
  const isHost = hostId === session.user.id;
  const personal = await prisma.userPersonalSettings.findUnique({
    where: { userId: session.user.id },
  });
  const mic = resolveEntryMicrophoneOn({
    inTeamWorkspace: true,
    team: currentMeeting.team.policy
      ? { forceMicrophoneOff: currentMeeting.team.policy.forceMicrophoneOff }
      : null,
    personal: {
      defaultMicrophoneOn: personal?.defaultMicrophoneOn ?? false,
      preferredInputDeviceId: personal?.preferredInputDeviceId ?? null,
    },
  });

  const token = new AccessToken(apiKey, apiSecret, {
    identity: session.user.id,
    name: session.user.name || "사용자",
    ttl: "2h",
    metadata: JSON.stringify({
      teamMeetingId: currentMeeting.id,
      teamId: currentMeeting.teamId,
      role: isHost ? "host" : "participant",
    }),
  });
  token.addGrant({
    roomJoin: true,
    room: currentMeeting.livekitRoomName,
    canPublish: true,
    ...(currentMeeting.team.policy?.forceMicrophoneOff
      ? { canPublishSources: [] }
      : {}),
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isHost,
  });

  return NextResponse.json({
    ok: true,
    token: await token.toJwt(),
    url,
    roomName: currentMeeting.livekitRoomName,
    isHost,
    recordingActive: currentMeeting.recordingActive,
    micDefaults: mic,
    serverNow: new Date().toISOString(),
    derived,
  });
}
