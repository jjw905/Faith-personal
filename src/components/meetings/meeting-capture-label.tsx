import { AudioLines, Upload } from "lucide-react";

import {
  meetingCaptureLabel,
  resolveMeetingCapture,
} from "@/lib/meeting-capture";
import type { Meeting, MeetingCapture } from "@/types/meeting";
import { cn } from "@/lib/utils";

/**
 * M3 assist chip — 기록 경로 구분.
 * 실시간/업로드 동일 primary filled, 아이콘만 다르게.
 */
const CAPTURE_ICON: Record<MeetingCapture, typeof AudioLines> = {
  live: AudioLines,
  upload: Upload,
};

function MeetingCaptureBadge({
  meeting,
  size = "sm",
  className,
}: {
  meeting: Pick<Meeting, "id" | "tags" | "capture">;
  size?: "sm" | "md";
  className?: string;
}) {
  const capture = resolveMeetingCapture(meeting);
  const label = meetingCaptureLabel(meeting);
  const Icon = CAPTURE_ICON[capture];
  const compact = size === "sm";

  return (
    <span
      className={cn(
        "inline-flex w-fit max-w-full items-center bg-primary font-medium tracking-wide text-primary-foreground",
        compact
          ? "h-7 gap-1 rounded-md px-2 text-sm leading-none"
          : "h-8 gap-1.5 rounded-lg px-2.5 text-[15px] leading-none",
        className,
      )}
      aria-label={`기록 방식 ${label}`}
    >
      <Icon
        className={compact ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"}
        strokeWidth={2}
        aria-hidden
      />
      <span className="truncate">{label}</span>
    </span>
  );
}

/** 목록·확인 다이얼로그용 (밀도 높은 list). */
export function MeetingCaptureOverline({
  meeting,
  className,
}: {
  meeting: Pick<Meeting, "id" | "tags" | "capture">;
  className?: string;
}) {
  return (
    <MeetingCaptureBadge meeting={meeting} size="sm" className={className} />
  );
}

/** 상세 메타 줄용. */
export function MeetingCaptureChip({
  meeting,
  className,
}: {
  meeting: Pick<Meeting, "id" | "tags" | "capture">;
  className?: string;
}) {
  return (
    <MeetingCaptureBadge meeting={meeting} size="md" className={className} />
  );
}
