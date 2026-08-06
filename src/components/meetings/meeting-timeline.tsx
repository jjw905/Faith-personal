"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileBarChart,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  Scale,
  X,
} from "lucide-react";

import { ExpandableMeetingSearch } from "@/components/dashboard/meeting-search";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Participant } from "@/types/meeting";
import type {
  MeetingTimeline,
  TimelineSegment,
  TimelineSegmentKind,
} from "@/types/timeline";
import { cn } from "@/lib/utils";

/** 종류별 아이콘 + 짧은 한글 라벨(한눈에 의미). 색 톤·면 없이 아이콘만. */
const KIND_META: Record<
  TimelineSegmentKind,
  {
    label: string;
    icon: typeof ClipboardList;
  }
> = {
  agenda: {
    label: "안건",
    icon: ClipboardList,
  },
  discussion: {
    label: "논의",
    icon: MessageSquare,
  },
  decision: {
    label: "결정",
    icon: CheckCircle2,
  },
  action: {
    label: "후속",
    icon: ListChecks,
  },
  risk: {
    label: "주의",
    icon: AlertTriangle,
  },
  report: {
    label: "보고",
    icon: FileBarChart,
  },
  vote: {
    label: "표결",
    icon: Scale,
  },
};

type SpeakerView = {
  key: string;
  name: string;
  initials: string;
  color: string;
  /** 진행자처럼 따로 알려줄 게 있을 때만. 없으면 뱃지를 달지 않는다. */
  roleLabel: string | null;
};

const FALLBACK_COLOR = "bg-[#8a6a4a]";

function resolveSpeaker(
  name: string,
  participants: Participant[],
  index: number,
): SpeakerView {
  const found = participants.find((p) => p.name === name);
  // 이름만 있으면 이름으로 충분하다. 진행자만 따로 표시한다.
  const roleLabel =
    name === "진행자" || found?.isHost === true ? "진행자" : null;

  if (found) {
    return {
      key: `${found.id}-${index}`,
      name: found.name,
      initials: found.initials,
      color: found.color,
      roleLabel: found.name === "진행자" ? null : roleLabel,
    };
  }

  return {
    key: `spk-${index}-${name}`,
    name,
    initials: name.replace(/^화자\s*/, "").slice(0, 1) || name.slice(0, 1),
    color: FALLBACK_COLOR,
    roleLabel: name === "진행자" ? null : roleLabel,
  };
}

/** 화자별 발언 요지가 있으면 그것까지 같이 보여준다. */
function SpeakerLines({
  names,
  notes,
  participants,
}: {
  names: string[];
  notes?: Array<{ name: string; said: string }>;
  participants: Participant[];
}) {
  const speakers = names.map((name, index) =>
    resolveSpeaker(name, participants, index),
  );
  const saidBy = new Map((notes ?? []).map((n) => [n.name, n.said]));
  const hasNotes = speakers.some((s) => saidBy.has(s.name));

  if (!hasNotes) {
    return (
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-2 md:gap-x-2.5" aria-label="발화자">
        {speakers.map((s) => (
          <li
            key={s.key}
            className="inline-flex min-h-12 items-center gap-2 md:h-7 md:min-h-0 md:gap-1.5"
          >
            <Avatar className="h-8 w-8 shrink-0 md:h-6 md:w-6">
              <AvatarFallback
                className={cn(
                  "text-sm font-semibold leading-none text-white md:text-xs",
                  s.color,
                )}
              >
                {s.initials}
              </AvatarFallback>
            </Avatar>
            <span className="max-w-[8rem] truncate text-base font-semibold leading-5 text-foreground">
              {s.name}
            </span>
            {s.roleLabel ? (
              <span className="shrink-0 text-sm font-medium leading-4 text-muted-2">
                {s.roleLabel}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="mt-3 flex flex-col gap-2" aria-label="발화자">
      {speakers.map((s) => {
        const said = saidBy.get(s.name);
        return (
          <li key={s.key} className="flex min-w-0 items-start gap-2">
            <Avatar className="mt-0.5 h-8 w-8 shrink-0 md:h-6 md:w-6">
              <AvatarFallback
                className={cn(
                  "text-sm font-semibold leading-none text-white md:text-xs",
                  s.color,
                )}
              >
                {s.initials}
              </AvatarFallback>
            </Avatar>
            <p className="min-w-0 text-base leading-6">
              <span className="font-semibold text-foreground">{s.name}</span>
              {said ? (
                <span className="text-muted"> {said}</span>
              ) : null}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function segmentMatches(seg: TimelineSegment, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const kindLabel = (KIND_META[seg.kind] ?? KIND_META.discussion).label;
  const haystack = [
    seg.title,
    seg.summary,
    seg.start,
    seg.end,
    kindLabel,
    ...(seg.speakers ?? []),
    ...(seg.points ?? []),
    ...(seg.speakerNotes ?? []).map((n) => `${n.name} ${n.said}`),
    ...(seg.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

function speakerInSegment(seg: TimelineSegment, speaker: string): boolean {
  const target = speaker.trim().toLowerCase();
  if (!target) return true;
  const names = seg.speakers ?? [];
  if (names.some((n) => n.trim().toLowerCase() === target)) return true;
  // "화자 위원장" ↔ summary/title 포함 매칭
  const hay = `${seg.title} ${seg.summary}`.toLowerCase();
  if (hay.includes(target)) return true;
  const short = target.replace(/^화자\s*/, "");
  if (short && short !== target) {
    if (names.some((n) => n.toLowerCase().includes(short))) return true;
  }
  return false;
}

/**
 * 녹음 00:00부터 시간 순으로 흐르는 세로 타임라인.
 * 말한 길이가 아니라, 구간이 언제 시작·끝나는지만 표시.
 */
export function MeetingTimelineView({
  timeline,
  participants = [],
  speakerFilter = null,
  onClearSpeakerFilter,
  onSegmentSelect,
  chatHref,
}: {
  timeline: MeetingTimeline;
  participants?: Participant[];
  /** 참석에서 고른 화자 — 해당 구간만 표시 */
  speakerFilter?: string | null;
  onClearSpeakerFilter?: () => void;
  /** 구간 선택 시 대화기록 점프용 */
  onSegmentSelect?: (segmentId: string) => void;
  /** 있으면 툴바에 대화·다시듣기 링크 */
  chatHref?: string;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const filtered = timeline.segments.filter(
    (seg) =>
      segmentMatches(seg, deferredQuery) &&
      (!speakerFilter || speakerInSegment(seg, speakerFilter)),
  );
  const searching = deferredQuery.trim().length > 0;
  const metaLabel =
    searching || speakerFilter
      ? `${filtered.length}/${timeline.segments.length}`
      : timeline.durationLabel;

  return (
    <section aria-label="타임라인">
      <ExpandableMeetingSearch
        value={query}
        onChange={setQuery}
        placeholder="구간·키워드 검색"
        label="타임라인 검색"
        toolbar={
          <div className="flex min-h-12 min-w-0 items-center gap-2 pb-2 md:min-h-11 md:gap-2.5 md:pb-2.5">
            <p className="shrink-0 text-sm font-semibold tracking-wide text-muted-2">
              타임라인
            </p>
            <span className="shrink-0 text-base font-medium tabular-nums text-muted-2">
              {metaLabel}
            </span>
            {speakerFilter ? (
              <button
                type="button"
                onClick={onClearSpeakerFilter}
                className="inline-flex min-h-12 max-w-[10rem] cursor-pointer items-center gap-1.5 truncate text-base font-semibold text-primary md:h-8 md:min-h-0"
              >
                <span className="truncate">{speakerFilter}</span>
                <X className="h-4 w-4 shrink-0" strokeWidth={2} />
              </button>
            ) : null}
            {chatHref ? (
              <Link
                href={chatHref}
                className="ml-auto hidden min-h-0 shrink-0 items-center gap-2 px-1 text-base font-semibold text-primary transition-colors hover:text-primary-hover md:inline-flex"
              >
                <MessagesSquare className="h-4 w-4" strokeWidth={1.75} />
                대화, 다시듣기
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mt-5">
      {filtered.length === 0 ? (
        <p className="py-10 text-center text-base text-muted">
          {speakerFilter
            ? `${speakerFilter}이(가) 표시된 구간이 없습니다.`
            : "검색 결과가 없습니다."}
        </p>
      ) : (
        <ol className="relative">
          {filtered.map((seg, index) => {
            const meta = KIND_META[seg.kind] ?? KIND_META.discussion;
            const Icon = meta.icon;
            const isLast = index === filtered.length - 1;

            return (
              <li
                key={seg.id}
                className={cn(
                  "relative flex gap-3 sm:gap-4",
                  /* 구간 간격 — 세로선이 다음 시각 앞에서 끊기도록 pb와 선 mb를 짝맞춤 */
                  !isLast && "pb-8",
                )}
              >
                {/* 녹음 시각: 아이콘과 같은 높이대 */}
                <div className="flex w-[3.75rem] shrink-0 justify-end pt-2.5 sm:w-[4.25rem] md:pt-2">
                  <time
                    dateTime={seg.start}
                    className="text-base font-bold tabular-nums tracking-tight text-foreground"
                  >
                    {seg.start}
                  </time>
                </div>

                {/*
                  축: 아이콘 → 종류 라벨 → (여백) → 선 → (여백) → 다음 시각.
                  선은 라벨·다음 시각과 겹치지 않고, 위·아래 여백을 같게(0.5rem).
                */}
                <div className="relative flex w-11 shrink-0 flex-col items-center self-stretch">
                  <div
                    className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center md:h-9 md:w-9"
                    aria-label={meta.label}
                    title={meta.label}
                  >
                    <Icon
                      className="h-5 w-5 text-muted md:h-4 md:w-4"
                      strokeWidth={2}
                      aria-hidden
                    />
                  </div>
                  <span className="relative z-10 mt-1.5 shrink-0 text-sm font-semibold leading-none text-muted-2">
                    {meta.label}
                  </span>
                  {!isLast ? (
                    <span
                      aria-hidden
                      className="mt-2 mb-[-1.5rem] w-px min-h-0 flex-1 bg-border"
                    />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1 pt-1">
                  {onSegmentSelect ? (
                    <button
                      type="button"
                      onClick={() => onSegmentSelect(seg.id)}
                      className="min-h-12 text-left text-lg font-semibold text-foreground underline-offset-2 hover:underline md:min-h-0"
                    >
                      {seg.title}
                    </button>
                  ) : (
                    <h3 className="text-lg font-semibold text-foreground">
                      {seg.title}
                    </h3>
                  )}
                  <p className="mt-2 text-base leading-[1.65] text-muted">
                    {seg.summary}
                  </p>
                  {seg.points && seg.points.length > 0 ? (
                    <ul className="mt-2.5 flex flex-col gap-1.5">
                      {seg.points.map((point) => (
                        <li
                          key={point}
                          className="flex gap-2 text-base leading-6 text-foreground"
                        >
                          <span
                            aria-hidden
                            className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-muted-2"
                          />
                          <span className="min-w-0">{point}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {seg.speakers && seg.speakers.length > 0 ? (
                    <SpeakerLines
                      names={seg.speakers}
                      notes={seg.speakerNotes}
                      participants={participants}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      </div>
    </section>
  );
}
