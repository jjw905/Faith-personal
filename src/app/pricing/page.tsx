import type { Metadata } from "next";

import { ContactInquiryProvider } from "@/components/marketing/contact-inquiry-provider";
import { PricingTiers } from "@/components/marketing/pricing-tiers";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteNav } from "@/components/marketing/site-nav";

export const metadata: Metadata = {
  title: "요금제 · Faith",
  description: "개인부터 조직까지, 안전한 회의록을 위한 Faith 요금제.",
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
