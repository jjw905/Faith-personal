import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireUser();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { demandSurveyConsentAt: true },
  });
  return NextResponse.json({
    ok: true,
    consented: Boolean(user?.demandSurveyConsentAt),
  });
}

export async function POST() {
  const session = await requireUser();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { demandSurveyConsentAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
