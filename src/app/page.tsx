import type { Metadata } from "next";
import type { Session } from "next-auth";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FeatureTimeline } from "@/components/marketing/feature-timeline";
import { Hero } from "@/components/marketing/hero";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

export const metadata: Metadata = {
  title: "Faith · AI 회의록",
  description:
    "화자 구분 받아쓰기, 요약, 타임라인으로 회의를 자동 정리하는 AI 회의록. 개인정보 마스킹은 부가로 따라옵니다.",
};

/** 사이트 루트 — 로그인 중이면 앱으로, 아니면 마케팅 메인(브랜딩 우선). */
export default async function HomePage() {
  let session: Session | null = null;
  try {
    session = await auth();
  } catch {
    // 세션 조회 실패 시에도 게스트에게 브랜딩을 보여 준다.
  }
  if (session?.user?.id && !session.user.disabled) {
    redirect("/dashboard");
  }

  return (
    <MarketingShell>
      <SiteNav />
      <main className="flex-1">
        <Hero />
        <FeatureTimeline />
      </main>
      <SiteFooter />
    </MarketingShell>
  );
}
