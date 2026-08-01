import { NextResponse } from "next/server";

import { REALTIME_FEATURE_ENABLED } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { requireUser } from "@/lib/require-user";
import { persistRealtimeUtterance } from "@/lib/stt/realtime/live-session-store";
import {
  reserveRealtimeQuota,
  UploadQuotaExceededError,
} from "@/lib/stt/usage-quota";
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
  const liveSession = await prisma.realtimeSttSession.findFirst({
    where: {
      id: sessionId,
      userId: userSession.user.id,
      status: "ACTIVE",
    },
    select: {
      meetingId: true,
      startedAt: true,
      teamMeetingId: true,
      teamMeeting: {
        select: {
          teamId: true,
          organizerId: true,
          access: {
            where: { userId: userSession.user.id },
            select: { acknowledgedAt: true },
            take: 1,
          },
        },
      },
      personalMeeting: {
        select: { ownerId: true },
      },
    },
  });
  if (liveSession?.teamMeetingId) {
    const teamFeature = await getTeamFeatureAccess(userSession.user.id);
    if (!teamFeature.ok) return teamFeatureFailureResponse(teamFeature);
    if (liveSession.teamMeeting) {
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
    }
    if (
      liveSession.teamMeeting &&
      liveSession.teamMeeting.organizerId !== userSession.user.id &&
      !liveSession.teamMeeting.access[0]?.acknowledgedAt
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: "MEETING_ACK_REQUIRED",
          message: "참석 확인 후 실시간 기록을 저장할 수 있습니다.",
        },
        { status: 409 },
      );
    }
  }
  const utteranceLimit = rateLimit({
    key: `realtime-utterance:${userSession.user.id}:${sessionId}:${clientIp(request)}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!utteranceLimit.ok) {
    return rateLimitResponse(utteranceLimit.retryAfterSec);
  }

  let body: {
    itemId?: string;
    sequence?: number;
    text?: string;
    startSec?: number;
    endSec?: number;
    confidence?: number;
    meanLogprob?: number;
  };
  let audioBytes: Buffer | undefined;
  let audioFilename: string | undefined;
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 6 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, message: "받아쓰기 요청이 너무 큽니다." },
        { status: 413 },
      );
    }
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      body = JSON.parse(String(form.get("utterance") ?? "{}")) as typeof body;
      const audio = form.get("audio");
      if (audio instanceof File) {
        if (audio.size > 4 * 1024 * 1024) {
          return NextResponse.json(
            { ok: false, message: "재받아쓰기 음성 구간이 너무 큽니다." },
            { status: 413 },
          );
        }
        audioBytes = Buffer.from(await audio.arrayBuffer());
        audioFilename = audio.name || "utterance.wav";
      }
    } else {
      body = await request.json();
    }
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const itemId = body.itemId?.trim().slice(0, 200);
  const text = body.text?.trim();
  if (!itemId || !text || text.length > 8_000) {
    return NextResponse.json(
      { ok: false, message: "받아쓰기 발화 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  // 차감 시간은 조작 가능한 클라이언트 타임스탬프가 아니라 서버 세션
  // 시작시각으로 계산한다. body start/end는 대화 위치 표시 용도로만 쓴다.
  const elapsedSec = liveSession
    ? Math.max(
        0,
        Math.min(
          6 * 60 * 60,
          (Date.now() - liveSession.startedAt.getTime()) / 1000,
        ),
      )
    : 0;
  try {
    if (liveSession && !liveSession.teamMeetingId) {
      await reserveRealtimeQuota({
        userId: liveSession.personalMeeting?.ownerId ?? userSession.user.id,
        meetingId: liveSession.meetingId,
        elapsedSec,
      });
    }
  } catch (error) {
    if (error instanceof UploadQuotaExceededError) {
      return NextResponse.json(
        {
          ok: false,
          code: "ANALYSIS_GRACE_EXHAUSTED",
          message:
            "이번 주기 잔여 시간이 없습니다. 기록을 종료하고 추가 시간을 이용해 주세요.",
        },
        { status: 429 },
      );
    }
    throw error;
  }

  try {
    const result = await persistRealtimeUtterance({
      sessionId,
      userId: userSession.user.id,
      itemId,
      sequence:
        typeof body.sequence === "number" && Number.isFinite(body.sequence)
          ? body.sequence
          : 0,
      text,
      startSec:
        typeof body.startSec === "number" && Number.isFinite(body.startSec)
          ? body.startSec
          : 0,
      endSec:
        typeof body.endSec === "number" && Number.isFinite(body.endSec)
          ? body.endSec
          : undefined,
      confidence:
        typeof body.confidence === "number" && Number.isFinite(body.confidence)
          ? body.confidence
          : undefined,
      meanLogprob:
        typeof body.meanLogprob === "number" &&
        Number.isFinite(body.meanLogprob)
          ? body.meanLogprob
          : undefined,
      audioBytes,
      audioFilename,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "받아쓰기 발화를 저장하지 못했습니다.",
      },
      { status: 404 },
    );
  }
}
