import { NextResponse } from "next/server";

import { NAVER_LOGIN_ENABLED } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

const LINKABLE = ["google", "naver", "twitter"] as const;

function isLinkable(provider: string): provider is (typeof LINKABLE)[number] {
  return (LINKABLE as readonly string[]).includes(provider);
}

/** 연결된 소셜 목록. */
export async function GET() {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요해요." }, { status: 401 });
  }

  const [accounts, user] = await Promise.all([
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { provider: true, providerAccountId: true },
      orderBy: { id: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true, signupProvider: true },
    }),
  ]);

  const linked = accounts
    .filter((a) => isLinkable(a.provider))
    .map((a) => a.provider);

  const primary =
    user?.signupProvider && isLinkable(user.signupProvider)
      ? user.signupProvider
      : null;

  return NextResponse.json({
    ok: true,
    linked,
    primary,
    hasPassword: Boolean(user?.passwordHash),
    available: LINKABLE.filter((p) => {
      if (p === "google") {
        return Boolean(
          process.env.AUTH_GOOGLE_ID?.trim() &&
            process.env.AUTH_GOOGLE_SECRET?.trim(),
        );
      }
      if (p === "naver") {
        // 임시 중단: 새 연결은 막되, 이미 연동된 계정은 계속 보이고 해제도 된다.
        return Boolean(
          NAVER_LOGIN_ENABLED &&
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
    return NextResponse.json({ ok: false, message: "로그인이 필요해요." }, { status: 401 });
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

  if (!isLinkable(provider)) {
    return NextResponse.json({ ok: false, message: "지원하지 않는 제공자" }, { status: 400 });
  }

  const [accounts, user] = await Promise.all([
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { id: true, provider: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true, signupProvider: true },
    }),
  ]);

  const target = accounts.find((a) => a.provider === provider);
  if (!target) {
    return NextResponse.json({ ok: false, message: "연동되지 않은 계정" }, { status: 404 });
  }

  if (user?.signupProvider === provider) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "이 방법으로 가입한 계정이에요. 다른 로그인 방법을 추가한 뒤에는 연결을 해제할 수 있어요.",
      },
      { status: 400 },
    );
  }

  const remainingSocial = accounts.filter((a) => a.provider !== provider).length;
  const hasPassword = Boolean(user?.passwordHash);
  if (!hasPassword && remainingSocial === 0) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "지금 로그인할 수 있는 방법이 이것뿐이에요. 비밀번호를 먼저 설정해 주세요.",
      },
      { status: 400 },
    );
  }

  await prisma.account.delete({ where: { id: target.id } });
  return NextResponse.json({ ok: true, unlinked: provider });
}
