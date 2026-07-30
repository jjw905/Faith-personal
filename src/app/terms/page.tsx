import type { Metadata } from "next";

import { LegalDocsView } from "@/components/legal/legal-docs-view";

export const metadata: Metadata = {
  title: "이용약관, Faith",
  description:
    "Faith 서비스 제공, 팀, 주최자 책임, 금지 행위, 일정, 음성, 받아쓰기, 접근, 감사, 유료 이용, 약관 변경에 관한 이용약관입니다.",
};

export default function TermsPage() {
  return <LegalDocsView doc="terms" />;
}
