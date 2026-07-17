import { CalendarDays, Clock } from "lucide-react";

import { Separator } from "@/components/ui/separator";
import type { Meeting } from "@/types/meeting";

interface DashboardSummaryProps {
  meetings: Meeting[];
}

export function DashboardSummary({ meetings }: DashboardSummaryProps) {
  const recentMeeting = [...meetings].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  )[0];

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted" />
        <span className="text-muted">회의수</span>
        <span className="font-semibold text-foreground">{meetings.length}</span>
      </div>

      <Separator orientation="vertical" className="hidden h-4 sm:block" />

      <div className="flex min-w-0 items-center gap-2">
        <Clock className="h-4 w-4 shrink-0 text-muted" />
        <span className="shrink-0 text-muted">최근 회의기록</span>
        <span className="truncate font-semibold text-foreground">
          {recentMeeting?.title ?? "-"}
        </span>
      </div>
    </div>
  );
}
