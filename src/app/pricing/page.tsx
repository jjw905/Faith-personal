import type { Metadata } from "next";

import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PricingTiers } from "@/components/marketing/pricing-tiers";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

export const metadata: Metadata = {
  title: "요금제 · Faith",
  description:
    "나의 방식에 맞는 Faith 요금제를 골라보세요. 개인 회의 정리부터 팀 협업까지.",
};

/** 요금제 소개 페이지. */
export default function PricingPage() {
  return (
    <MarketingShell>
      <SiteNav />
      <main className="flex-1">
        <PricingTiers />
      </main>
      <SiteFooter />
    </MarketingShell>
  );
}
