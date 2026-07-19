"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessagesSquare } from "lucide-react";

import { MeetingAttachmentsList } from "@/components/meetings/meeting-attachments";
import { MeetingParticipants } from "@/components/meetings/meeting-participants";
import { MeetingTimelineView } from "@/components/meetings/meeting-timeline";
import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";
import { cn } from "@/lib/utils";

type DetailTab = "timeline" | "files";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "timeline", label: "타임라인" },
  { id: "files", label: "첨부" },
];

/** 타임라인 / 첨부. 대화기록은 별도 채팅 다시보기로 이동. */
export function MeetingDetailBody({
  meeting,
  timeline,
  transcript,
  summary,
}: {
  meeting: Meeting;
  timeline: MeetingTimeline;
  transcript: MeetingTranscript;
  summary?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<DetailTab>("timeline");
  const chatHref = `/meetings/${meeting.id}/chat`;

  return (
    <>
      {summary ? (
        <section className="rounded-2xl bg-surface px-4 py-4 sm:px-5">
          <p className="text-[11px] font-semibold tracking-wide text-muted-2">
            요약
          </p>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-foreground">
            {summary}
          </p>
        </section>
      ) : null}

      <MeetingParticipants participants={meeting.participants} />

      <div>
        <div className="flex items-end justify-between gap-3 border-b border-border">
          <div
            role="tablist"
            aria-label="회의 기록 분류"
            className="flex min-w-0 flex-wrap gap-x-5 gap-y-1"
          >
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  "-mb-px shrink-0 border-b-2 pb-2.5 pt-0.5 text-sm font-semibold transition-colors",
                  tab === item.id
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <Link
            href={chatHref}
            className="mb-1.5 inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft"
          >
            <MessagesSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
            대화기록
          </Link>
        </div>

        <div className="mt-3" role="tabpanel">
          {tab === "timeline" ? (
            <MeetingTimelineView
              timeline={timeline}
              participants={meeting.participants}
              onSegmentSelect={(segmentId) => {
                router.push(`${chatHref}?segment=${segmentId}`);
              }}
            />
          ) : null}
          {tab === "files" ? (
            <MeetingAttachmentsList
              transcript={transcript}
              onSelectLine={(lineId) => {
                router.push(`${chatHref}?line=${lineId}`);
              }}
            />
          ) : null}
        </div>
      </div>
    </>
  );
}
