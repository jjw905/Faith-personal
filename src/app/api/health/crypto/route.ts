import { NextResponse } from "next/server";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

/** 가입 장애 진단용. 비밀값 없음. */
export async function GET() {
  const out: Record<string, unknown> = {};
  try {
    const t0 = Date.now();
    const hash = await hashPassword("DiagPass1!");
    out.bcryptMs = Date.now() - t0;
    out.bcryptOk = hash.startsWith("$2");
  } catch (err) {
    out.bcryptOk = false;
    out.bcryptError =
      err instanceof Error ? err.message.slice(0, 200) : "bcrypt_error";
  }

  try {
    const t1 = Date.now();
    const n = await prisma.user.count();
    out.userCount = n;
    out.userCountMs = Date.now() - t1;
  } catch (err) {
    out.userCountError =
      err instanceof Error ? err.message.slice(0, 200) : "count_error";
  }

  try {
    // 쓰기 가능 여부만 확인 (실제 유저 생성 없음)
    await prisma.$executeRaw`SELECT 1`;
    out.writeProbe = "ok";
  } catch (err) {
    out.writeProbe =
      err instanceof Error ? err.message.slice(0, 200) : "write_error";
  }

  const ok = out.bcryptOk === true && out.userCountError == null;
  return NextResponse.json({ ok, ...out }, { status: ok ? 200 : 503 });
}
