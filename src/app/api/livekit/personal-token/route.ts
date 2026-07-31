import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { REALTIME_FEATURE_ENABLED } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import {
  getPersonalRealtimeMeeting,
  isPersonalRealtimeParticipant,
} from "@/lib/personal-realtime";
import { requireUser } from "@/lib/require-user";
import { resolveEntryMicrophoneOn } from "@/lib/team/settings-precedence";

export async function POST(request: Request) {
  if (!REALTIME_FEATURE_ENABLED) {
    return NextResponse.json(
      { ok: false, message: "실시간 기록은 오픈 준비중이에요." },
      { status: 403 },
    );
  }
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  let body: { personalMeetingId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  const meetingId = body.personalMeetingId?.trim();
  if (!meetingId) {
    return NextResponse.json(
      { ok: false, message: "개인 실시간 회의 ID가 필요합니다." },
      { status: 400 },
    );
  }
  const meeting = await getPersonalRealtimeMeeting(meetingId);
  if (!meeting) {
    return NextResponse.json(
      { ok: false, message: "개인 실시간 회의를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (!["LOBBY", "ACTIVE"].includes(meeting.state)) {
    return NextResponse.json(
      { ok: false, message: "이미 종료된 개인 실시간 회의입니다." },
      { status: 409 },
    );
  }
  if (
    !isPersonalRealtimeParticipant({
      meeting,
      userId: session.user.id,
    })
  ) {
    return NextResponse.json(
      { ok: false, message: "개인 실시간 회의 참가 권한이 없습니다." },
      { status: 403 },
    );
  }

  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) {
    return NextResponse.json(
      { ok: false, message: "음성 서버 설정이 필요합니다." },
      { status: 503 },
    );
  }

  const personal = await prisma.userPersonalSettings.findUnique({
    where: { userId: session.user.id },
    select: {
      defaultMicrophoneOn: true,
      preferredInputDeviceId: true,
    },
  });
  const mic = resolveEntryMicrophoneOn({
    inTeamWorkspace: false,
    team: null,
    personal: {
      defaultMicrophoneOn: personal?.defaultMicrophoneOn ?? false,
      preferredInputDeviceId: personal?.preferredInputDeviceId ?? null,
    },
  });
  await prisma.personalRealtimeAccess.updateMany({
    where: { meetingId: meeting.id, userId: session.user.id },
    data: { joinedAt: new Date() },
  });

  const isHost = meeting.ownerId === session.user.id;
  const token = new AccessToken(apiKey, apiSecret, {
    identity: session.user.id,
    name: session.user.name || "사용자",
    ttl: "2h",
    metadata: JSON.stringify({
      personalMeetingId: meeting.id,
      role: isHost ? "host" : "participant",
    }),
  });
  token.addGrant({
    roomJoin: true,
    room: meeting.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: isHost,
  });

  return NextResponse.json({
    ok: true,
    token: await token.toJwt(),
    url,
    roomName: meeting.roomName,
    isHost,
    recordingActive: meeting.recordingActive,
    micDefaults: mic,
    serverNow: new Date().toISOString(),
  });
}
