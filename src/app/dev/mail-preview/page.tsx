import { notFound } from "next/navigation";

import { MailPreviewClient } from "@/app/dev/mail-preview/mail-preview-client";

export const dynamic = "force-dynamic";

/** 로컬 전용. 트랜잭션 메일 HTML 프리뷰 (React 컴포넌트 아님, iframe srcDoc). */
export default function MailPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MailPreviewClient />;
}
