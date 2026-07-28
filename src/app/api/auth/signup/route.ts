import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isEmailTaken } from "@/lib/auth-store";
import { AUTH_PASSWORD_INVALID } from "@/lib/auth-messages";
import {
  isValidEmail,
  isValidKoreanName,
  isValidPassword,
  normalizeAuthEmail,
} from "@/lib/auth-validation";
import {
  consumeSignupProof,
  hashSignupProof,
  SIGNUP_PROOF_COOKIE,
} from "@/lib/otp";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { sendWelcomeEmail } from "@/lib/resend-mail";

export async function POST(request: Request) {
  try {
    const limited = enforceAuthRateLimit(request, "signup", 5, 15 * 60_000);
    if (limited) return limited;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, message: "요청 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const data =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)
        : {};

    const email =
      typeof data.email === "string" ? normalizeAuthEmail(data.email) : "";
    const password = typeof data.password === "string" ? data.password : "";
    const passwordConfirm =
      typeof data.passwordConfirm === "string" ? data.passwordConfirm : "";
    const name = typeof data.name === "string" ? data.name.trim() : "";
    const proof = typeof data.proof === "string" ? data.proof.trim() : "";

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, message: "올바른 이메일을 입력해 주세요." },
        { status: 400 },
      );
    }

    if (!proof) {
      return NextResponse.json(
        {
          ok: false,
          message: "이메일 인증이 필요합니다. 인증을 다시 진행해 주세요.",
          code: "proof_required",
        },
        { status: 400 },
      );
    }

    const jar = await cookies();
    const bind = jar.get(SIGNUP_PROOF_COOKIE)?.value;
    if (!bind || bind !== hashSignupProof(proof)) {
      return NextResponse.json(
        {
          ok: false,
          message: "이메일 인증이 만료되었습니다. 인증을 다시 진행해 주세요.",
          code: "proof_expired",
        },
        { status: 400 },
      );
    }

    try {
      if (await isEmailTaken(email)) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "가입을 완료할 수 없습니다. 로그인을 시도하거나 잠시 후 다시 시도해 주세요.",
          },
          { status: 409 },
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      console.error("[signup] email check", msg.slice(0, 300));
      return NextResponse.json(
        {
          ok: false,
          message: /does not exist|P2021/i.test(msg)
            ? "데이터베이스가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요."
            : "회원가입에 실패했습니다. 다시 시도해 주세요.",
        },
        { status: 503 },
      );
    }

    const proofOk = await consumeSignupProof(email, proof);
    if (!proofOk) {
      return NextResponse.json(
        {
          ok: false,
          message: "이메일 인증이 만료되었습니다. 인증을 다시 진행해 주세요.",
          code: "proof_expired",
        },
        { status: 400 },
      );
    }

    if (!isValidPassword(password)) {
      return NextResponse.json(
        {
          ok: false,
          message: AUTH_PASSWORD_INVALID,
        },
        { status: 400 },
      );
    }
    if (password !== passwordConfirm) {
      return NextResponse.json(
        { ok: false, message: "비밀번호 확인이 일치하지 않습니다." },
        { status: 400 },
      );
    }
    if (!isValidKoreanName(name)) {
      return NextResponse.json(
        {
          ok: false,
          message: "이름은 정확한 한글 이름(2~5자)으로 입력해 주세요.",
        },
        { status: 400 },
      );
    }

    let passwordHash: string;
    try {
      passwordHash = await hashPassword(password);
    } catch (err) {
      console.error(
        "[signup] hash",
        err instanceof Error ? err.message.slice(0, 300) : err,
      );
      return NextResponse.json(
        {
          ok: false,
          message: "비밀번호 처리에 실패했습니다. 다시 시도해 주세요.",
        },
        { status: 500 },
      );
    }

    try {
      await prisma.user.create({
        data: {
          email,
          name,
          passwordHash,
          signupProvider: "credentials",
          emailVerified: new Date(),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      console.error("[signup] create", msg.slice(0, 300));
      if (/P2002|Unique constraint/i.test(msg)) {
        return NextResponse.json(
          {
            ok: false,
            message:
              "가입을 완료할 수 없습니다. 로그인을 시도하거나 잠시 후 다시 시도해 주세요.",
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          ok: false,
          message: /does not exist|P2021|password_hash|Unknown arg/i.test(msg)
            ? "데이터베이스가 아직 준비되지 않았습니다. 잠시 후 다시 시도해 주세요."
            : "회원가입에 실패했습니다. 다시 시도해 주세요.",
          code: /P20\d{2}/.exec(msg)?.[0] ?? undefined,
        },
        { status: 503 },
      );
    }

    void sendWelcomeEmail(email, name).catch((err) => {
      console.error(
        "[signup] welcome email",
        err instanceof Error ? err.message.slice(0, 300) : err,
      );
    });

    const res = NextResponse.json({
      ok: true,
      message: "회원가입이 완료되었습니다. 바로 로그인할 수 있습니다.",
    });
    res.cookies.set(SIGNUP_PROOF_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return res;
  } catch (err) {
    console.error(
      "[signup] unhandled",
      err instanceof Error ? err.message.slice(0, 300) : err,
    );
    return NextResponse.json(
      { ok: false, message: "회원가입 처리 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
