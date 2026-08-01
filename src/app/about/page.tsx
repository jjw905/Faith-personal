import type { Metadata } from "next";

import { AboutDocsView } from "@/components/marketing/about-docs-view";

export const metadata: Metadata = {
  title: "제품 소개, Faith",
  description:
    "Faith의 핵심 가치, 회의 정리 기능, 보안 설계와 품질 관리 방식을 안내합니다.",
};

export default function AboutPage() {
  return <AboutDocsView />;
}
