"use server";

import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/auth";
import { isEmailVerified } from "@/lib/auth-store";
import { isValidEmail } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";
import { isResendConfigured, sendVerificationEmail } from "@/lib/resend-mail";

export type SocialProvider = "naver" | "google" | "twitter";

/** 소셜 OAuth → 이메일 인증 대기 */
export async function signInWithProvider(provider: SocialProvider) {
  try {
    await signIn(provider, { redirectTo: "/signup/verify" });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect(`/login?error=${error.type}`);
    }
    throw error;
  }
}

/** X 등 이메일 없음 → DB에 저장 후 Resend */
export async function submitSignupEmail(formData: FormData) {
  const emailRaw = String(formData.get("email") ?? "").trim();
  if (!isValidEmail(emailRaw)) {
    redirect("/signup/email?error=invalid");
  }
  const email = emailRaw.toLowerCase();
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signup");
  }

  const taken = await prisma.user.findFirst({
    where: { email, NOT: { id: session.user.id } },
    select: { id: true },
  });
  if (taken) {
    redirect("/signup/email?error=taken");
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { email },
  });

  const jar = await cookies();
  jar.set("faith.pending-email", email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  if (!(await isEmailVerified(email))) {
    if (!isResendConfigured() && session.user.id) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { emailVerified: new Date() },
      });
      redirect("/dashboard");
    }
    await sendVerificationEmail(email, session.user.name);
  }
  redirect("/signup/verify");
}

/** 인증 메일 재발송 */
export async function resendVerificationEmail() {
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
    redirect("/signup/email");
  }
  if (await isEmailVerified(email)) {
    redirect("/dashboard");
  }
  if (!isResendConfigured()) {
    if (session?.user?.id) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { emailVerified: new Date() },
      });
    }
    redirect("/dashboard");
  }
  await sendVerificationEmail(email, session?.user?.name);
  redirect("/signup/verify?resent=1");
}
