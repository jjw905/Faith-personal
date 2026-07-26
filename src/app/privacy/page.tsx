import type { Metadata } from "next";

import { LegalDocsView } from "@/components/legal/legal-docs-view";

export const metadata: Metadata = {
  title: "개인정보 처리방침, Faith",
  description:
    "Faith가 수집하는 개인정보 항목, 이용 목적, 음성, STT 처리, 팀 접근, 보관 및 파기, 위탁, 국외 이전, 이용자 권리를 안내합니다.",
};

export default function PrivacyPage() {
  return <LegalDocsView doc="privacy" />;
}
