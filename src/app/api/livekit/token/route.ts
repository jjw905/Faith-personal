import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { deriveMeetingState, effectiveHostId } from "@/lib/team/meeting-lifecycle";
import { markParticipantJoined } from "@/lib/team/reconcile-meeting";
import { reconcileTeamMeeting } from "@/lib/team/reconcile-meeting";
import { resolveEntryMicrophoneOn } from "@/lib/team/settings-precedence";

export async function POST(request: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: { teamMeetingId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.teamMeetingId) {
    return NextResponse.json({ ok: false, message: "회의 ID가 필요합니다." }, { status: 400 });
  }

  await reconcileTeamMeeting(body.teamMeetingId);
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
  const derived = meeting ? deriveMeetingState(meeting) : null;
  const canJoin =
    meeting &&
    membership &&
    meeting.mode === "ONLINE" &&
    meeting.state !== "CANCELED" &&
    meeting.state !== "ENDED" &&
    meeting.livekitRoomName &&
    derived?.canJoin &&
    (meeting.organizerId === session.user.id || access?.isParticipant);

  if (!canJoin || !meeting?.livekitRoomName || !derived) {
    return NextResponse.json({ ok: false, message: "음성 회의 참가 권한이 없습니다." }, { status: 403 });
  }

  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    return NextResponse.json({ ok: false, message: "음성 서버 설정이 필요합니다." }, { status: 503 });
  }

  await markParticipantJoined({
    meetingId: meeting.id,
    userId: session.user.id,
  });

  const hostId = effectiveHostId(meeting);
  const isHost = hostId === session.user.id;
  const personal = await prisma.userPersonalSettings.findUnique({
    where: { userId: session.user.id },
  });
  const mic = resolveEntryMicrophoneOn({
    inTeamWorkspace: true,
    team: meeting.team.policy
      ? { forceMicrophoneOff: meeting.team.policy.forceMicrophoneOff }
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
      teamMeetingId: meeting.id,
      teamId: meeting.teamId,
      role: isHost ? "host" : "participant",
    }),
  });
  token.addGrant({
    roomJoin: true,
    room: meeting.livekitRoomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isHost,
  });

  return NextResponse.json({
    ok: true,
    token: await token.toJwt(),
    url,
    roomName: meeting.livekitRoomName,
    isHost,
    recordingActive: meeting.recordingActive,
    micDefaults: mic,
    serverNow: new Date().toISOString(),
    derived,
  });
}
