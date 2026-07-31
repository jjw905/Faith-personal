import { NextResponse } from "next/server";

import { REALTIME_FEATURE_ENABLED } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

type RouteContext = { params: Promise<{ meetingId: string }> };

export async function POST(request: Request, context: RouteContext) {
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
  let body: { action?: "start" | "stop" };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  if (body.action !== "start" && body.action !== "stop") {
    return NextResponse.json(
      { ok: false, message: "기록 동작을 확인해 주세요." },
      { status: 400 },
    );
  }

  const meeting = await prisma.personalRealtimeMeeting.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      ownerId: true,
      state: true,
      recordingActive: true,
      startedAt: true,
    },
  });
  if (!meeting) {
    return NextResponse.json(
      { ok: false, message: "개인 실시간 회의를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (meeting.ownerId !== session.user.id) {
    return NextResponse.json(
      { ok: false, message: "주최자만 기록을 제어할 수 있습니다." },
      { status: 403 },
    );
  }

  if (body.action === "start") {
    if (!["LOBBY", "ACTIVE"].includes(meeting.state)) {
      return NextResponse.json(
        { ok: false, message: "시작할 수 없는 개인 실시간 회의입니다." },
        { status: 409 },
      );
    }
    const updated = await prisma.personalRealtimeMeeting.update({
      where: { id: meeting.id },
      data: {
        state: "ACTIVE",
        recordingActive: true,
        startedAt: meeting.startedAt ?? new Date(),
      },
      select: { recordingActive: true, state: true },
    });
    return NextResponse.json({ ok: true, ...updated });
  }

  if (!meeting.recordingActive) {
    return NextResponse.json({
      ok: true,
      recordingActive: false,
      state: meeting.state,
    });
  }
  const updated = await prisma.personalRealtimeMeeting.update({
    where: { id: meeting.id },
    data: {
      recordingActive: false,
      state: "ENDED",
      endedAt: new Date(),
    },
    select: { recordingActive: true, state: true },
  });
  return NextResponse.json({ ok: true, ...updated });
}
