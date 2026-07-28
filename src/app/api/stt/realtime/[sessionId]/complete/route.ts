import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { completeRealtimeSession } from "@/lib/stt/realtime/live-session-store";
import { effectiveHostId } from "@/lib/team/meeting-lifecycle";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const userSession = await requireUser();
  if (!userSession) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const { sessionId } = await context.params;

  let body: { durationSec?: number; finalizeTeam?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const liveSession = await prisma.realtimeSttSession.findFirst({
    where: { id: sessionId, userId: userSession.user.id },
    include: { teamMeeting: true },
  });
  if (!liveSession) {
    return NextResponse.json(
      { ok: false, message: "실시간 기록 세션을 찾을 수 없습니다." },
      { status: 404 },
    );
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

  try {
    const result = await completeRealtimeSession({
      sessionId,
      userId: userSession.user.id,
      durationSec:
        typeof body.durationSec === "number" &&
        Number.isFinite(body.durationSec)
          ? body.durationSec
          : 0,
      finalizeTeam,
    });
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
