"use client";

import { RecentMeetingsTable } from "@/components/dashboard/recent-meetings-table";
import { AppProvider } from "@/context/app-context";
import type { Meeting } from "@/types/meeting";

/** 로컬 비율 검수용. 프로덕션 미사용. */
export function RecordsPreviewClient({ meetings }: { meetings: Meeting[] }) {
  return (
    <AppProvider>
      <div className="min-h-screen bg-background p-6">
        <div className="mx-auto max-w-5xl" id="meetings">
          <RecentMeetingsTable meetings={meetings} />
        </div>
      </div>
    </AppProvider>
  );
}
