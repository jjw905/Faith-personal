import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { FeatureTimeline } from "@/components/marketing/feature-timeline";
import { Hero } from "@/components/marketing/hero";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

export const metadata: Metadata = {
  title: "Faith · 안전한 회의록과 개인정보 마스킹",
  description:
    "채팅과 회의록의 개인정보를 규칙과 NER 하이브리드로 자동 감지, 마스킹하는 보안 플랫폼.",
};

/** 사이트 루트 — 로그인 중이면 앱으로, 아니면 마케팅 메인. */
export default async function HomePage() {
  const session = await auth();
  if (
    session?.user?.id &&
    session.user.emailVerified &&
    !session.user.disabled
  ) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteNav />
      <main>
        <Hero />
        <FeatureTimeline />
      </main>
      <SiteFooter />
    </div>
  );
}
