import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { effectiveHostId } from "@/lib/team/meeting-lifecycle";
import {
  isLiveTeamSttRuntimeAvailable,
  LIVE_TEAM_STT_INTEGRATION,
  liveTeamSttUnavailableMessage,
} from "@/lib/team/live-stt";
import { isPreHostRecordingAllowed } from "@/lib/team/reconcile-meeting";
import { writeTeamAudit } from "@/lib/team-permissions";

type RouteContext = { params: Promise<{ meetingId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
  const { meetingId } = await context.params;
  let body: { action?: "start" | "stop" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }
  const meeting = await prisma.teamMeeting.findUnique({
    where: { id: meetingId },
    include: {
      team: { include: { policy: true } },
      access: { where: { userId: session.user.id }, take: 1 },
    },
  });
  if (!meeting || meeting.mode !== "ONLINE") {
    return NextResponse.json({ ok: false, message: "회의를 찾을 수 없습니다." }, { status: 404 });
  }
  const hostId = effectiveHostId(meeting);
  if (hostId !== session.user.id) {
    return NextResponse.json(
      { ok: false, message: "실제 주최자만 기록을 제어할 수 있습니다." },
      { status: 403 },
    );
  }
  if (
    !meeting.access[0]?.isParticipant &&
    meeting.organizerId !== session.user.id &&
    meeting.currentHostId !== session.user.id
  ) {
    return NextResponse.json({ ok: false, message: "참가 중인 주최자만 가능합니다." }, { status: 403 });
  }

  const now = new Date();
  if (body.action === "start") {
    if (!meeting.hostPresentAt && !isPreHostRecordingAllowed(meeting)) {
      return NextResponse.json(
        { ok: false, message: "주최자 도착 전 기록이 허용되지 않습니다." },
        { status: 403 },
      );
    }
    // Do not fake STT activation. Voice transport stays independent.
    if (!isLiveTeamSttRuntimeAvailable()) {
      await writeTeamAudit({
        teamId: meeting.teamId,
        actorId: session.user.id,
        meetingId,
        action: "meeting.recording_start_unavailable",
        metadata: {
          integration: LIVE_TEAM_STT_INTEGRATION,
          recordingActive: false,
          quotaUnchanged: true,
        },
        request,
      });
      return NextResponse.json(
        {
          ok: false,
          code: "LIVE_STT_UNAVAILABLE",
          message: liveTeamSttUnavailableMessage(),
          recordingActive: false,
          label: "기록 전",
          integration: LIVE_TEAM_STT_INTEGRATION,
          sttAccumulatedSeconds: meeting.sttAccumulatedSeconds,
        },
        { status: 503 },
      );
    }
    // Reserved for the future LiveKit → STT bridge. Unreachable while
    // isLiveTeamSttRuntimeAvailable() is false.
    const updated = await prisma.teamMeeting.update({
      where: { id: meetingId },
      data: {
        recordingActive: true,
        sttStartedAt: now,
      },
    });
    await writeTeamAudit({
      teamId: meeting.teamId,
      actorId: session.user.id,
      meetingId,
      action: "meeting.recording_started",
      request,
    });
    return NextResponse.json({
      ok: true,
      recordingActive: true,
      label: "기록 중",
      meeting: updated,
    });
  }

  if (body.action === "stop") {
    if (!meeting.recordingActive) {
      return NextResponse.json({
        ok: true,
        recordingActive: false,
        label: "기록 전",
        sttAccumulatedSeconds: meeting.sttAccumulatedSeconds,
      });
    }
    let accumulated = meeting.sttAccumulatedSeconds;
    if (meeting.sttStartedAt) {
      accumulated += Math.max(
        0,
        Math.floor((now.getTime() - meeting.sttStartedAt.getTime()) / 1000),
      );
    }
    const updated = await prisma.teamMeeting.update({
      where: { id: meetingId },
      data: {
        recordingActive: false,
        sttStartedAt: null,
        sttAccumulatedSeconds: accumulated,
      },
    });
    await writeTeamAudit({
      teamId: meeting.teamId,
      actorId: session.user.id,
      meetingId,
      action: "meeting.recording_stopped",
      metadata: { sttAccumulatedSeconds: accumulated },
      request,
    });
    return NextResponse.json({
      ok: true,
      recordingActive: false,
      label: "기록 전",
      meeting: updated,
    });
  }

  return NextResponse.json({ ok: false, message: "동작을 확인해 주세요." }, { status: 400 });
}
