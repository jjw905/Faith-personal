import { NextResponse } from "next/server";

import { REALTIME_FEATURE_ENABLED } from "@/lib/feature-flags";
import {
  getPersonalRealtimeMeeting,
  isPersonalRealtimeParticipant,
} from "@/lib/personal-realtime";
import { requireUser } from "@/lib/require-user";
import { personalRealtimeHref } from "@/lib/personal-realtime";

type RouteContext = { params: Promise<{ meetingId: string }> };

export async function GET(_: Request, context: RouteContext) {
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
  const { meetingId } = await context.params;
  const meeting = await getPersonalRealtimeMeeting(meetingId);
  if (!meeting) {
    return NextResponse.json(
      { ok: false, message: "개인 실시간 회의를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (
    !isPersonalRealtimeParticipant({
      meeting,
      userId: session.user.id,
    })
  ) {
    return NextResponse.json(
      {
        ok: false,
        code: "PERSONAL_REALTIME_INVITE_REQUIRED",
        message: "초대를 수락한 회원만 입장할 수 있습니다.",
      },
      { status: 403 },
    );
  }

  const participants = meeting.access
    .filter((access) => access.status === "ACCEPTED")
    .map((access) => ({
      userId: access.userId,
      name: access.user.name,
      handle: access.user.handle,
      image: access.user.image,
      joinedAt: access.joinedAt?.toISOString() ?? null,
    }));
  const pendingInvites =
    meeting.ownerId === session.user.id
      ? meeting.access
          .filter((access) => access.status === "PENDING")
          .map((access) => ({
            inviteId: access.id,
            userId: access.userId,
            name: access.user.name,
            handle: access.user.handle,
            image: access.user.image,
          }))
      : [];

  return NextResponse.json({
    ok: true,
    meeting: {
      id: meeting.id,
      title: meeting.title,
      ownerId: meeting.ownerId,
      maxParticipants: meeting.maxParticipants,
      state: meeting.state,
      recordingActive: meeting.recordingActive,
      participants,
      pendingInvites,
      href: personalRealtimeHref(meeting.id),
    },
    isOwner: meeting.ownerId === session.user.id,
  });
}
