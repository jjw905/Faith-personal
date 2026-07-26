import { NextResponse } from "next/server";

import { isEmailTaken } from "@/lib/auth-store";
import {
  isValidEmail,
  isValidKoreanName,
  isValidPassword,
} from "@/lib/auth-validation";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { enforceAuthRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const limited = enforceAuthRateLimit(request, "signup", 5, 60_000);
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
      typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    const password = typeof data.password === "string" ? data.password : "";
    const passwordConfirm =
      typeof data.passwordConfirm === "string" ? data.passwordConfirm : "";
    const name = typeof data.name === "string" ? data.name.trim() : "";

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, message: "올바른 이메일을 입력해 주세요." },
        { status: 400 },
      );
    }

    try {
      if (await isEmailTaken(email)) {
        return NextResponse.json(
          { ok: false, message: "이미 사용 중인 이메일입니다." },
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

    if (!isValidPassword(password)) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "비밀번호는 8~72자, 영문 대소문자와 특수문자를 각각 1자 이상 포함해야 합니다.",
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

    return NextResponse.json({
      ok: true,
      message: "회원가입이 완료되었습니다. 바로 로그인할 수 있습니다.",
    });
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
