import { NextResponse } from "next/server";

import { REALTIME_FEATURE_ENABLED } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { completeRealtimeSession } from "@/lib/stt/realtime/live-session-store";
import {
  finalizeAnalysisUsage,
  reserveRealtimeQuota,
  UploadQuotaExceededError,
  type QuotaReservation,
} from "@/lib/stt/usage-quota";
import { effectiveHostId } from "@/lib/team/meeting-lifecycle";
import {
  getTeamFeatureAccess,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!REALTIME_FEATURE_ENABLED) {
    return NextResponse.json(
      { ok: false, message: "실시간 기록은 오픈 준비중이에요." },
      { status: 403 },
    );
  }
  const userSession = await requireUser();
  if (!userSession) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const { sessionId } = await context.params;

  let body: {
    durationSec?: number;
    finalizeTeam?: boolean;
    finalizePersonal?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const liveSession = await prisma.realtimeSttSession.findFirst({
    where: {
      id: sessionId,
      userId: userSession.user.id,
      status: "ACTIVE",
    },
    include: {
      teamMeeting: true,
      personalMeeting: {
        select: { id: true, ownerId: true, recordingActive: true },
      },
    },
  });
  if (!liveSession) {
    return NextResponse.json(
      { ok: false, message: "실시간 기록 세션을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (liveSession.teamMeeting) {
    const teamFeature = await getTeamFeatureAccess(userSession.user.id);
    if (!teamFeature.ok) return teamFeatureFailureResponse(teamFeature);
    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: liveSession.teamMeeting.teamId,
          userId: userSession.user.id,
        },
      },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json(
        { ok: false, message: "팀 회의 접근 권한이 없습니다." },
        { status: 403 },
      );
    }
    if (liveSession.teamMeeting.organizerId !== userSession.user.id) {
      const access = await prisma.teamMeetingAccess.findUnique({
        where: {
          meetingId_userId: {
            meetingId: liveSession.teamMeeting.id,
            userId: userSession.user.id,
          },
        },
        select: { acknowledgedAt: true },
      });
      if (!access?.acknowledgedAt) {
        return NextResponse.json(
          {
            ok: false,
            code: "MEETING_ACK_REQUIRED",
            message: "참석 확인 후 실시간 기록을 완료할 수 있습니다.",
          },
          { status: 409 },
        );
      }
    }
  }

  const finalizeTeam = body.finalizeTeam === true;
  if (finalizeTeam && liveSession.teamMeeting) {
    if (effectiveHostId(liveSession.teamMeeting) !== userSession.user.id) {
      return NextResponse.json(
        { ok: false, message: "주최자만 팀 기록을 완료할 수 있습니다." },
        { status: 403 },
      );
    }
    if (liveSession.teamMeeting.recordingActive) {
      return NextResponse.json(
        { ok: false, message: "기록을 중지한 뒤 완료해 주세요." },
        { status: 409 },
      );
    }
  }
  const finalizePersonal = body.finalizePersonal === true;
  if (finalizePersonal && liveSession.personalMeeting) {
    if (liveSession.personalMeeting.ownerId !== userSession.user.id) {
      return NextResponse.json(
        { ok: false, message: "주최자만 개인 기록을 완료할 수 있습니다." },
        { status: 403 },
      );
    }
    if (liveSession.personalMeeting.recordingActive) {
      return NextResponse.json(
        { ok: false, message: "기록을 중지한 뒤 완료해 주세요." },
        { status: 409 },
      );
    }
  }

  try {
    // 최종 차감도 클라이언트가 보낸 durationSec이 아니라 서버 세션 시간으로
    // 확정한다. 클라이언트 값은 이전 버전 요청 호환을 위해서만 파싱한다.
    const durationSec = Math.max(
      0,
      Math.min(
        6 * 60 * 60,
        (Date.now() - liveSession.startedAt.getTime()) / 1000,
      ),
    );
    let reservation: QuotaReservation | null = null;
    try {
      if (!liveSession.teamMeetingId) {
        reservation = await reserveRealtimeQuota({
          userId:
            liveSession.personalMeeting?.ownerId ?? userSession.user.id,
          meetingId: liveSession.meetingId,
          elapsedSec: durationSec,
        });
      }
    } catch (error) {
      // 마지막 발화에서 이미 허용 한도까지 예약했다면 기록 저장은 끝까지
      // 완료한다. 새 초과분은 예약되지 않으며 기존 예약만 확정한다.
      if (!(error instanceof UploadQuotaExceededError)) throw error;
    }
    const result = await completeRealtimeSession({
      sessionId,
      userId: userSession.user.id,
      durationSec,
      finalizeTeam,
      finalizePersonal,
    });
    const shouldFinalizeQuota =
      !liveSession.personalMeeting || finalizePersonal;
    if (shouldFinalizeQuota) {
      if (reservation) await reservation.finalize();
      else await finalizeAnalysisUsage(liveSession.meetingId);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "실시간 기록을 완료하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
