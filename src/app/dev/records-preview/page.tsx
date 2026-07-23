import { notFound } from "next/navigation";

import { RecordsPreviewClient } from "@/app/dev/records-preview/records-preview-client";
import { getMeetingsByWorkspace } from "@/lib/meetings-mock";

/** 로컬 렌더/비율 검수 전용. */
export default function RecordsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const meetings = getMeetingsByWorkspace("personal");
  return <RecordsPreviewClient meetings={meetings} />;
}
