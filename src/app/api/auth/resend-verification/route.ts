import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import { isEmailVerified } from "@/lib/auth-store";
import { isValidEmail } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { isResendConfigured, sendVerificationEmail } from "@/lib/resend-mail";

/** 인증 메일 재발송 (Server Action 대신). */
export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "resend-verify", 10, 60_000);
  if (limited) return limited;

  const session = await auth();
  const jar = await cookies();
  const pending = jar.get("faith.pending-email")?.value;
  let email = (session?.user?.email || pending || "").trim().toLowerCase();

  if ((!email || !isValidEmail(email)) && session?.user?.id) {
    const db = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true },
    });
    email = db?.email?.toLowerCase() ?? "";
  }

  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, redirect: "/signup/email" },
      { status: 400 },
    );
  }

  if (await isEmailVerified(email)) {
    return NextResponse.json({ ok: true, redirect: "/dashboard" });
  }

  if (!isResendConfigured()) {
    if (session?.user?.id) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { emailVerified: new Date() },
      });
    }
    return NextResponse.json({ ok: true, redirect: "/dashboard" });
  }

  await sendVerificationEmail(email, session?.user?.name);
  return NextResponse.json({ ok: true, redirect: "/signup/verify?resent=1" });
}
