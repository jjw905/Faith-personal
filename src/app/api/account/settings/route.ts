import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/require-user";
import { prisma } from "@/lib/prisma";
import {
  parseAccountDisplayPrefs,
  SUMMARY_LANGUAGES,
  type AccountDisplayPrefs,
} from "@/lib/account-settings";

export const dynamic = "force-dynamic";

/** 개인 회의 기록 기본값(자동 마스킹, 화자 분리, 요약 언어). 본인 것만 조회, 수정. */
export async function GET() {
  const session = await requireUser();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const row = await prisma.userPersonalSettings.findUnique({
    where: { userId: session.user.id },
    select: { displayPrefs: true },
  });
  const prefs = parseAccountDisplayPrefs(row?.displayPrefs);
  return NextResponse.json({ ok: true, ...prefs });
}

export async function PATCH(request: Request) {
  const session = await requireUser();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  let body: Partial<AccountDisplayPrefs>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const existing = await prisma.userPersonalSettings.findUnique({
    where: { userId: session.user.id },
    select: { displayPrefs: true },
  });
  const rawPrefs =
    existing?.displayPrefs &&
    typeof existing.displayPrefs === "object" &&
    !Array.isArray(existing.displayPrefs)
      ? { ...(existing.displayPrefs as Record<string, unknown>) }
      : {};
  const current = parseAccountDisplayPrefs(rawPrefs);

  let summaryLangComingSoon = false;
  let nextSummaryLang = current.summaryLang;
  if (typeof body.summaryLang === "string") {
    if (body.summaryLang === "en") {
      // UI는 준비중. API 직접 PATCH도 en 저장을 막고 ko로 강제한다.
      nextSummaryLang = "ko";
      summaryLangComingSoon = true;
    } else if (
      SUMMARY_LANGUAGES.includes(
        body.summaryLang as AccountDisplayPrefs["summaryLang"],
      )
    ) {
      nextSummaryLang = body.summaryLang as AccountDisplayPrefs["summaryLang"];
    }
  }

  const prefs: AccountDisplayPrefs = {
    autoMask:
      typeof body.autoMask === "boolean" ? body.autoMask : current.autoMask,
    speakerSplit:
      typeof body.speakerSplit === "boolean"
        ? body.speakerSplit
        : current.speakerSplit,
    summaryLang: nextSummaryLang,
  };
  // 다른 키가 displayPrefs에 있어도 지우지 않는다(/api/personal-settings와 공존).
  const next = { ...rawPrefs, ...prefs };

  await prisma.userPersonalSettings.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      displayPrefs: next as unknown as Prisma.InputJsonValue,
    },
    update: { displayPrefs: next as unknown as Prisma.InputJsonValue },
  });

  return NextResponse.json({
    ok: true,
    ...prefs,
    ...(summaryLangComingSoon ? { comingSoon: ["summaryLang:en"] } : {}),
  });
}
