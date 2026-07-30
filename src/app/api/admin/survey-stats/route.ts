import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { summarizeSurveyStats } from "@/lib/stt/survey-stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabled: true },
  });
  if (!dbUser || dbUser.disabled || dbUser.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const summary = await summarizeSurveyStats();
  return NextResponse.json({ ok: true, summary });
}
