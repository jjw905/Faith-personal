import { Mic, Upload } from "lucide-react";

import {
  meetingCaptureLabel,
  resolveMeetingCapture,
} from "@/lib/meeting-capture";
import type { Meeting, MeetingCapture } from "@/types/meeting";
import { cn } from "@/lib/utils";

/**
 * 기록 경로 구분 — 원형 테두리 + 아이콘.
 * 녹음 Mic / 업로드 Upload.
 */
const CAPTURE_ICON: Record<MeetingCapture, typeof Mic> = {
  live: Mic,
  upload: Upload,
};

const CAPTURE_SIZE = {
  sm: { box: "h-5 w-5", icon: "h-3 w-3" },
  md: { box: "h-6 w-6", icon: "h-3.5 w-3.5" },
  /** 제목 행(상세·목록) — text-lg/2xl과 광학 맞춤 */
  lg: { box: "h-10 w-10", icon: "h-5 w-5" },
} as const;

/** 목록 trailing·메타용: 원형 아이콘 (라벨은 aria). */
export function MeetingCaptureIcon({
  meeting,
  className,
  size = "md",
}: {
  meeting: Pick<Meeting, "id" | "tags" | "capture">;
  className?: string;
  size?: keyof typeof CAPTURE_SIZE;
}) {
  const capture = resolveMeetingCapture(meeting);
  const label = meetingCaptureLabel(meeting);
  const Icon = CAPTURE_ICON[capture];
  const dims = CAPTURE_SIZE[size];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-border text-muted",
        dims.box,
        className,
      )}
      aria-label={`기록 방식 ${label}`}
      title={label}
    >
      <Icon className={dims.icon} strokeWidth={2} aria-hidden />
    </span>
  );
}

function MeetingCaptureBadge({
  meeting,
  size = "sm",
  className,
}: {
  meeting: Pick<Meeting, "id" | "tags" | "capture">;
  size?: keyof typeof CAPTURE_SIZE;
  className?: string;
}) {
  return (
    <MeetingCaptureIcon meeting={meeting} size={size} className={className} />
  );
}

/** 목록·확인 다이얼로그용: 아이콘만. */
export function MeetingCaptureOverline({
  meeting,
  className,
}: {
  meeting: Pick<Meeting, "id" | "tags" | "capture">;
  className?: string;
}) {
  return (
    <MeetingCaptureIcon meeting={meeting} size="sm" className={className} />
  );
}

/** 상세 제목 행용 — 제목 왼쪽, lg. */
export function MeetingCaptureChip({
  meeting,
  className,
  size = "lg",
}: {
  meeting: Pick<Meeting, "id" | "tags" | "capture">;
  className?: string;
  size?: keyof typeof CAPTURE_SIZE;
}) {
  return (
    <MeetingCaptureBadge meeting={meeting} size={size} className={className} />
  );
}
