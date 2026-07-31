"use client";

import Link from "next/link";
import { UsersRound } from "lucide-react";
import type { ReactNode } from "react";

import {
  PersonAvatar,
  displayPersonName,
} from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type UpcomingMeetingRowData = {
  id: string;
  title: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  organizer: { id: string; name: string | null; handle: string | null };
  invitedCount: number;
  canJoin: boolean;
  acknowledgementStats?: { invited: number; acknowledged: number };
};

function formatRange(start: string | null, end: string | null) {
  if (!start) return "-";
  const s = new Date(start);
  const e = end ? new Date(end) : null;
  const date = s.toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
  const startTime = s.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = e
    ? e.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    : "";
  return endTime ? `${date} ${startTime}, ${endTime}` : `${date} ${startTime}`;
}

function MeetingMeta({
  meeting,
  showAck,
}: {
  meeting: UpcomingMeetingRowData;
  showAck?: boolean;
}) {
  const organizerName = displayPersonName(
    meeting.organizer.name,
    meeting.organizer.handle,
  );

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <PersonAvatar name={organizerName} size="sm" />
      <span className="inline-flex items-center gap-1 text-base text-muted">
        <UsersRound className="h-4 w-4" aria-hidden />
        {meeting.invitedCount}
      </span>
      {showAck && meeting.acknowledgementStats ? (
        <span className="text-base text-muted">
          확인 {meeting.acknowledgementStats.acknowledged}/
          {meeting.acknowledgementStats.invited}
        </span>
      ) : null}
    </div>
  );
}

function MeetingActions({
  meeting,
  trailing,
  className,
}: {
  meeting: UpcomingMeetingRowData;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {meeting.canJoin ? (
        <Button
          asChild
          className="min-h-12 rounded-xl motion-safe:transition-transform motion-safe:duration-200 motion-reduce:transition-none"
        >
          <Link href={`/meetings/team/${meeting.id}`}>참가</Link>
        </Button>
      ) : null}
      {trailing}
    </div>
  );
}

/** 목록: 모바일 세로 스택, 데스크톱 3열 행 */
export function UpcomingMeetingRow({
  meeting,
  emphasized,
  showAck,
  trailing,
}: {
  meeting: UpcomingMeetingRowData;
  emphasized?: boolean;
  showAck?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 border-l-[3px] px-6 py-4 transition-colors sm:grid-cols-[minmax(9rem,auto)_1fr_auto] sm:items-center sm:gap-4 sm:py-5",
        emphasized
          ? "border-l-primary bg-primary-soft/55"
          : "border-l-transparent hover:bg-surface/70",
        meeting.canJoin &&
          "motion-safe:animate-[process-rise_200ms_ease-out] motion-reduce:animate-none",
      )}
    >
      <p className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
        {formatRange(meeting.scheduledStartAt, meeting.scheduledEndAt)}
      </p>
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold text-foreground">
          {meeting.title}
        </p>
        <div className="mt-1.5">
          <MeetingMeta meeting={meeting} showAck={showAck} />
        </div>
      </div>
      <MeetingActions meeting={meeting} trailing={trailing} />
    </div>
  );
}

/** 격자: 모바일 1열 카드, 데스크톱 다중 열 카드 */
export function UpcomingMeetingGridCard({
  meeting,
  emphasized,
  showAck,
  trailing,
}: {
  meeting: UpcomingMeetingRowData;
  emphasized?: boolean;
  showAck?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[10.5rem] flex-col rounded-2xl bg-surface p-4 transition-colors sm:min-h-[11.5rem]",
        emphasized
          ? "ring-2 ring-primary"
          : "ring-1 ring-border hover:bg-surface-2",
        meeting.canJoin &&
          "motion-safe:animate-[process-rise_200ms_ease-out] motion-reduce:animate-none",
      )}
    >
      <p className="text-base font-semibold tabular-nums tracking-tight text-muted sm:text-lg sm:text-foreground">
        {formatRange(meeting.scheduledStartAt, meeting.scheduledEndAt)}
      </p>
      <p className="mt-2 line-clamp-2 text-lg font-semibold leading-snug text-foreground">
        {meeting.title}
      </p>
      <div className="mt-2">
        <MeetingMeta meeting={meeting} showAck={showAck} />
      </div>
      <MeetingActions
        meeting={meeting}
        trailing={trailing}
        className="mt-auto pt-4"
      />
    </div>
  );
}
