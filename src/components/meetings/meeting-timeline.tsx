import {
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  MessageSquare,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MeetingTimeline, TimelineSegmentKind } from "@/types/timeline";
import { cn } from "@/lib/utils";

const KIND_META: Record<
  TimelineSegmentKind,
  { label: string; icon: typeof Sparkles; tone: string }
> = {
  agenda: {
    label: "안건",
    icon: Sparkles,
    tone: "bg-primary-soft text-primary",
  },
  discussion: {
    label: "논의",
    icon: MessageSquare,
    tone: "bg-surface-2 text-foreground",
  },
  decision: {
    label: "결정",
    icon: CheckCircle2,
    tone: "bg-success-soft text-success",
  },
  action: {
    label: "조치",
    icon: ListChecks,
    tone: "bg-primary-soft text-primary",
  },
  risk: {
    label: "리스크",
    icon: AlertTriangle,
    tone: "bg-warning-soft text-warning",
  },
};

/** 녹음 구간 분석 타임라인 + 구간별 요약. */
export function MeetingTimelineView({
  timeline,
}: {
  timeline: MeetingTimeline;
}) {
  return (
    <Card>
      <CardHeader className="space-y-2 pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">녹음 타임라인 요약</CardTitle>
          <span className="text-xs text-muted-2">{timeline.durationLabel}</span>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          {timeline.overallSummary}
        </p>
      </CardHeader>

      <CardContent className="pt-0">
        <ol className="relative space-y-0">
          <span
            aria-hidden
            className="pointer-events-none absolute top-3 bottom-3 left-[1.15rem] w-px bg-border"
          />

          {timeline.segments.map((seg, index) => {
            const meta = KIND_META[seg.kind];
            const Icon = meta.icon;
            const isLast = index === timeline.segments.length - 1;

            return (
              <li
                key={seg.id}
                className={cn("relative flex gap-4", !isLast && "pb-6")}
              >
                <div
                  className={cn(
                    "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    meta.tone,
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} />
                </div>

                <div className="min-w-0 flex-1 rounded-2xl border border-border bg-surface/60 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs tabular-nums text-muted-2">
                      {seg.start} – {seg.end}
                    </span>
                    <Badge variant="secondary" className="text-[10px]">
                      {meta.label}
                    </Badge>
                    {seg.tags?.map((tag) => (
                      <Badge
                        key={tag}
                        variant="outline"
                        className="text-[10px]"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <h3 className="mt-1.5 text-sm font-semibold text-foreground">
                    {seg.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {seg.summary}
                  </p>
                  {seg.speakers && seg.speakers.length > 0 ? (
                    <p className="mt-2 text-xs text-muted-2">
                      발화: {seg.speakers.join(", ")}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
