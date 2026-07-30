import { notFound } from "next/navigation";

import { UpcomingPreviewClient } from "@/app/dev/upcoming-preview/upcoming-preview-client";

/** 로컬 렌더 검수 전용. ?sheet=1 이면 상세 시트 강제 오픈. */
export default async function UpcomingPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ sheet?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const forceSheet = sp.sheet === "1";

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-5xl">
        <UpcomingPreviewClient forceSheet={forceSheet} />
      </div>
    </div>
  );
}
