import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { validateSurveyResponse } from "@/lib/stt/survey";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireUser();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const existing = await prisma.surveyResponse.findUnique({
    where: { userId: session.user.id },
    select: {
      paymentIntent: true,
      pricePreference: true,
      sttSatisfaction: true,
      featurePriorities: true,
      improvementNote: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ ok: true, completed: existing !== null, response: existing });
}

export async function POST(request: Request) {
  const session = await requireUser();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const limit = rateLimit({
    key: `survey-submit:${session.user.id}:${clientIp(request)}`,
    limit: 5,
    windowMs: 60_000,
  });
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const parsed = validateSurveyResponse(body);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 });
  }

  const existing = await prisma.surveyResponse.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });
  if (existing) {
    // 이미 참여함. 응답을 덮어쓰지 않고 그대로 완료 처리(중복 클릭 대비).
    return NextResponse.json({ ok: true, alreadyCompleted: true });
  }

  await prisma.surveyResponse.create({
    data: {
      userId: session.user.id,
      paymentIntent: parsed.value.paymentIntent,
      pricePreference: parsed.value.pricePreference,
      sttSatisfaction: parsed.value.sttSatisfaction,
      featurePriorities: parsed.value.featurePriorities,
      improvementNote: parsed.value.improvementNote,
    },
  });

  return NextResponse.json({ ok: true, alreadyCompleted: false });
}
