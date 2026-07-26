import type { Metadata } from "next";

import { ContactInquiryProvider } from "@/components/marketing/contact-inquiry-provider";
import { PricingTiers } from "@/components/marketing/pricing-tiers";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

export const metadata: Metadata = {
  title: "요금제 · Faith",
  description:
    "개인 회의록은 Pro, 함께하는 회의는 Team으로 이용하는 Faith 요금제.",
};

/** 요금제 소개 페이지. */
export default function PricingPage() {
  return (
    <ContactInquiryProvider>
      <div className="min-h-screen bg-background">
        <SiteNav />
        <main>
          <PricingTiers />
        </main>
        <SiteFooter />
      </div>
    </ContactInquiryProvider>
  );
}
