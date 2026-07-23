import { notFound } from "next/navigation";

import { MeetingMidPanel } from "@/components/dashboard/meeting-mid-panel";

/** 로컬 렌더 검수 전용. */
export default function UpcomingPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-5xl">
        <MeetingMidPanel />
      </div>
    </div>
  );
}
