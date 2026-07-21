import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

const LINKABLE = ["google", "naver", "twitter"] as const;

/** 연결된 소셜 목록. */
export async function GET() {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }

  const [accounts, user] = await Promise.all([
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { provider: true, providerAccountId: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    }),
  ]);

  const linked = accounts
    .filter((a) => (LINKABLE as readonly string[]).includes(a.provider))
    .map((a) => a.provider);

  return NextResponse.json({
    ok: true,
    linked,
    hasPassword: Boolean(user?.passwordHash),
    available: LINKABLE.filter((p) => {
      if (p === "google") {
        return Boolean(
          process.env.AUTH_GOOGLE_ID?.trim() &&
            process.env.AUTH_GOOGLE_SECRET?.trim(),
        );
      }
      if (p === "naver") {
        return Boolean(
          process.env.AUTH_NAVER_ID?.trim() &&
            process.env.AUTH_NAVER_SECRET?.trim(),
        );
      }
      return Boolean(
        process.env.AUTH_TWITTER_ID?.trim() &&
          process.env.AUTH_TWITTER_SECRET?.trim(),
      );
    }),
  });
}

/** 소셜 연동 해제. body: { provider } */
export async function DELETE(request: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청" }, { status: 400 });
  }

  const provider =
    typeof body === "object" &&
    body !== null &&
    "provider" in body &&
    typeof (body as { provider: unknown }).provider === "string"
      ? (body as { provider: string }).provider
      : "";

  if (!(LINKABLE as readonly string[]).includes(provider)) {
    return NextResponse.json({ ok: false, message: "지원하지 않는 제공자" }, { status: 400 });
  }

  const [accounts, user] = await Promise.all([
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { id: true, provider: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    }),
  ]);

  const target = accounts.find((a) => a.provider === provider);
  if (!target) {
    return NextResponse.json({ ok: false, message: "연동되지 않은 계정" }, { status: 404 });
  }

  const remainingSocial = accounts.filter((a) => a.provider !== provider).length;
  const hasPassword = Boolean(user?.passwordHash);
  if (!hasPassword && remainingSocial === 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "마지막 로그인 수단은 해제할 수 없습니다. 비밀번호를 먼저 설정해 주세요.",
      },
      { status: 400 },
    );
  }

  await prisma.account.delete({ where: { id: target.id } });
  return NextResponse.json({ ok: true, unlinked: provider });
}
