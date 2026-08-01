import type { Metadata } from "next";

import { HelpDocsView } from "@/components/help/help-docs-view";

export const metadata: Metadata = {
  title: "도움말 · Faith",
  description:
    "Faith 이용 방법, 회의 업로드·정리, 계정과 보안, 문의 안내를 모았습니다.",
};

export default function HelpPage() {
  return <HelpDocsView />;
}
