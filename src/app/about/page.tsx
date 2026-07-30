import type { Metadata } from "next";

import { AboutDocsView } from "@/components/marketing/about-docs-view";

export const metadata: Metadata = {
  title: "회사 소개, Faith",
  description:
    "Faith를 만드는 이유, 하는 일, 보안과 정확도를 대하는 방식, 운영팀 소개.",
};

export default function AboutPage() {
  return <AboutDocsView />;
}
