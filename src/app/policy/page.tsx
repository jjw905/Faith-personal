import type { Metadata } from "next";

import { LegalDocsView } from "@/components/legal/legal-docs-view";

export const metadata: Metadata = {
  title: "운영정책, Faith",
  description:
    "Faith의 금지 콘텐츠, 자동 검열 기준과 절차, 이의 제기, 위반 시 조치를 안내하는 운영정책입니다.",
};

export default function PolicyPage() {
  return <LegalDocsView doc="policy" />;
}
