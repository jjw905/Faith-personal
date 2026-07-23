"use client";

import { useDeferredValue, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileBarChart,
  ListChecks,
  MessageSquare,
  Scale,
  Search,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Participant } from "@/types/meeting";
import type {
  MeetingTimeline,
  TimelineSegment,
  TimelineSegmentKind,
} from "@/types/timeline";
import { cn } from "@/lib/utils";

/** 종류별 아이콘 + 짧은 한글 라벨(한눈에 의미). */
const KIND_META: Record<
  TimelineSegmentKind,
  {
    label: string;
    icon: typeof ClipboardList;
    iconTone: string;
  }
> = {
  agenda: {
    label: "안건",
    icon: ClipboardList,
    iconTone: "text-[#3d6a8a]",
  },
  discussion: {
    label: "논의",
    icon: MessageSquare,
    iconTone: "text-[#5c6570]",
  },
  decision: {
    label: "결정",
    icon: CheckCircle2,
    iconTone: "text-[#2f6b45]",
  },
  action: {
    label: "후속",
    icon: ListChecks,
    iconTone: "text-[#2f6f9f]",
  },
  risk: {
    label: "주의",
    icon: AlertTriangle,
    iconTone: "text-[#8a6a28]",
  },
  report: {
    label: "보고",
    icon: FileBarChart,
    iconTone: "text-[#5b4a8a]",
  },
  vote: {
    label: "표결",
    icon: Scale,
    iconTone: "text-[#6a4a2f]",
  },
};

type SpeakerRole = "host" | "attendee" | "voice";

type SpeakerView = {
  key: string;
  name: string;
  initials: string;
  color: string;
  roleLabel: string;
  roleClass: string;
};

/** 구분은 테두리가 아니라 역할 뱃지 면색·글자색. */
const ROLE_META: Record<
  SpeakerRole,
  { label: string; roleClass: string; fallbackColor: string }
> = {
  host: {
    label: "진행자",
    roleClass: "bg-[#c5d8e8] text-[#1f4a63]",
    fallbackColor: "bg-[#3d6a8a]",
  },
  attendee: {
    label: "참석자",
    roleClass: "bg-[#e4e6ea] text-[#3a3f4a]",
    fallbackColor: "bg-slate-500",
  },
  voice: {
    label: "발화",
    roleClass: "bg-[#e8d9c8] text-[#5c4028]",
    fallbackColor: "bg-[#8a6a4a]",
  },
};

function resolveSpeakerRole(
  name: string,
  found: Participant | undefined,
): SpeakerRole {
  if (name === "진행자" || found?.isHost === true) return "host";
  if (name === "참석자") return "attendee";
  if (found?.recognition === "voice") return "voice";
  if (found?.recognition === "guest" || found?.recognition === "member") {
    return "attendee";
  }
  if (found?.isMember === true) return "attendee";
  if (name === "발화" || name.startsWith("화자")) return "voice";
  return found ? "attendee" : "voice";
}

function resolveSpeaker(
  name: string,
  participants: Participant[],
  index: number,
): SpeakerView {
  const found = participants.find((p) => p.name === name);
  const role = resolveSpeakerRole(name, found);
  const meta = ROLE_META[role];

  if (found) {
    return {
      key: `${found.id}-${index}`,
      name: found.name,
      initials: found.initials,
      color: found.color,
      roleLabel: meta.label,
      roleClass: meta.roleClass,
    };
  }

  return {
    key: `${role}-${index}-${name}`,
    name,
    initials: name.slice(0, 1),
    color: meta.fallbackColor,
    roleLabel: meta.label,
    roleClass: meta.roleClass,
  };
}

function SpeakerChips({
  names,
  participants,
}: {
  names: string[];
  participants: Participant[];
}) {
  const speakers = names.map((name, index) =>
    resolveSpeaker(name, participants, index),
  );

  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="발화자">
      {speakers.map((s) => {
        const roleOnly = s.name === s.roleLabel;

        if (roleOnly) {
          return (
            <li
              key={s.key}
              className={cn(
                "inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-bold leading-none",
                s.roleClass,
              )}
            >
              {s.roleLabel}
            </li>
          );
        }

        return (
          <li
            key={s.key}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface py-0.5 pl-0.5 pr-2"
          >
            <Avatar className="h-7 w-7 shrink-0">
              <AvatarFallback
                className={cn(
                  "text-xs font-semibold leading-none text-white",
                  s.color,
                )}
              >
                {s.initials}
              </AvatarFallback>
            </Avatar>
            <span className="max-w-[7.5rem] truncate text-xs font-semibold leading-4 text-foreground">
              {s.name}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold leading-4",
                s.roleClass,
              )}
            >
              {s.roleLabel}
            </span>
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
}: {
  timeline: MeetingTimeline;
  participants?: Participant[];
  /** 참석에서 고른 화자 — 해당 구간만 표시 */
  speakerFilter?: string | null;
  onClearSpeakerFilter?: () => void;
  /** 구간 선택 시 대화기록 점프용 */
  onSegmentSelect?: (segmentId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const filtered = timeline.segments.filter(
    (seg) =>
      segmentMatches(seg, deferredQuery) &&
      (!speakerFilter || speakerInSegment(seg, speakerFilter)),
  );
  const searching = deferredQuery.trim().length > 0;

  return (
    <section>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="shrink-0 text-xs font-medium text-muted-2">
          {searching || speakerFilter
            ? `${filtered.length}/${timeline.segments.length}`
            : timeline.durationLabel}
        </span>

        {speakerFilter ? (
          <button
            type="button"
            onClick={onClearSpeakerFilter}
            className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full bg-primary-soft px-2.5 text-xs font-semibold text-primary"
          >
            {speakerFilter}
            <X className="h-3 w-3" strokeWidth={2} />
          </button>
        ) : null}

        <label className="ml-auto flex h-8 min-w-0 max-w-[11rem] flex-1 items-center rounded-lg bg-surface-2 px-2 sm:max-w-[13rem]">
          <span className="sr-only">타임라인 검색</span>
          <Search
            className="h-3.5 w-3.5 shrink-0 text-foreground/50"
            strokeWidth={1.75}
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="검색"
            className="min-w-0 flex-1 bg-transparent px-1.5 text-sm font-medium text-foreground outline-none placeholder:text-foreground/40 [&::-webkit-search-cancel-button]:hidden"
            autoComplete="off"
            enterKeyHint="search"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-foreground/50 hover:text-foreground"
              aria-label="검색어 지우기"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">
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
                className={cn("relative flex gap-3 sm:gap-4", !isLast && "pb-9")}
              >
                {/* 녹음 시각: 이 구간이 시작되는 지점 */}
                <div className="flex w-[3.75rem] shrink-0 justify-end pt-1.5 sm:w-[4.25rem]">
                  <time
                    dateTime={seg.start}
                    className="text-sm font-bold tabular-nums tracking-tight text-foreground"
                  >
                    {seg.start}
                  </time>
                </div>

                {/* 흐르는 축 + 종류 라벨 */}
                <div className="relative flex w-11 shrink-0 flex-col items-center">
                  {!isLast ? (
                    <span
                      aria-hidden
                      className="absolute top-9 bottom-[-2.25rem] w-px bg-border"
                    />
                  ) : null}
                  <div
                    className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surface"
                    aria-label={meta.label}
                    title={meta.label}
                  >
                    <Icon
                      className={cn("h-4 w-4", meta.iconTone)}
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  </div>
                  <span
                    className={cn(
                      "relative z-10 mt-1 text-xs font-semibold leading-none",
                      meta.iconTone,
                    )}
                  >
                    {meta.label}
                  </span>
                </div>

                <div className="min-w-0 flex-1 pt-1">
                  {onSegmentSelect ? (
                    <button
                      type="button"
                      onClick={() => onSegmentSelect(seg.id)}
                      className="text-left text-sm font-semibold text-foreground underline-offset-2 hover:underline"
                    >
                      {seg.title}
                    </button>
                  ) : (
                    <h3 className="text-sm font-semibold text-foreground">
                      {seg.title}
                    </h3>
                  )}
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {seg.summary}
                  </p>
                  {seg.speakers && seg.speakers.length > 0 ? (
                    <div className="mt-3">
                      <SpeakerChips
                        names={seg.speakers}
                        participants={participants}
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
