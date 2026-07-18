import { MapPin } from "lucide-react";

import { cn } from "@/lib/utils";

export type MeetingPlatform = "zoom" | "meet" | "discord" | "custom";

export type MeetingPlatformOption = {
  id: MeetingPlatform;
  label: string;
  /** 선택 링 색 */
  ringClassName: string;
  /** 원형 배경 (아이콘과 대비되는 색) */
  bgClassName: string;
  /** 마크 색 (배경 대비) */
  markClassName: string;
};

export const MEETING_PLATFORMS: MeetingPlatformOption[] = [
  {
    id: "zoom",
    label: "Zoom",
    ringClassName: "ring-[#2D8CFF]",
    bgClassName: "bg-[#2D8CFF]",
    markClassName: "text-white",
  },
  {
    id: "meet",
    label: "Google Meet",
    ringClassName: "ring-[#00897B]",
    bgClassName: "bg-[#00897B]",
    markClassName: "text-white",
  },
  {
    id: "discord",
    label: "Discord",
    ringClassName: "ring-[#5865F2]",
    bgClassName: "bg-[#5865F2]",
    markClassName: "text-white",
  },
  {
    id: "custom",
    label: "직접 입력",
    ringClassName: "ring-primary",
    bgClassName: "bg-primary",
    markClassName: "text-primary-foreground",
  },
];

export function getMeetingPlatform(
  id: MeetingPlatform | undefined,
): MeetingPlatformOption {
  return (
    MEETING_PLATFORMS.find((p) => p.id === id) ??
    MEETING_PLATFORMS[MEETING_PLATFORMS.length - 1]!
  );
}

/** 기존 location 문자열에서 플랫폼 추정. */
export function inferMeetingPlatform(location: string): MeetingPlatform {
  const v = location.toLowerCase();
  if (v.includes("zoom")) return "zoom";
  if (v.includes("meet") || v.includes("구글")) return "meet";
  if (v.includes("discord") || v.includes("디스코드")) return "discord";
  return "custom";
}

export function platformDefaultLocation(id: MeetingPlatform): string {
  if (id === "zoom") return "Zoom";
  if (id === "meet") return "Google Meet";
  if (id === "discord") return "Discord";
  return "";
}

/** Simple Icons (CC0) 경로 — 공식 마크 형태. */
function ZoomMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M5.033 14.649H.743a.74.74 0 0 1-.686-.458.74.74 0 0 1 .16-.808L3.19 10.41H1.06A1.06 1.06 0 0 1 0 9.35h3.957c.301 0 .57.18.686.458a.74.74 0 0 1-.161.808L1.51 13.59h2.464c.585 0 1.06.475 1.06 1.06zM24 11.338c0-1.14-.927-2.066-2.066-2.066-.61 0-1.158.265-1.537.686a2.061 2.061 0 0 0-1.536-.686c-1.14 0-2.066.926-2.066 2.066v3.311a1.06 1.06 0 0 0 1.06-1.06v-2.251a1.004 1.004 0 0 1 2.013 0v2.251c0 .586.474 1.06 1.06 1.06v-3.311a1.004 1.004 0 0 1 2.012 0v2.251c0 .586.475 1.06 1.06 1.06zM16.265 12a2.728 2.728 0 1 1-5.457 0 2.728 2.728 0 0 1 5.457 0zm-1.06 0a1.669 1.669 0 1 0-3.338 0 1.669 1.669 0 0 0 3.338 0zm-4.82 0a2.728 2.728 0 1 1-5.458 0 2.728 2.728 0 0 1 5.457 0zm-1.06 0a1.669 1.669 0 1 0-3.338 0 1.669 1.669 0 0 0 3.338 0z"
      />
    </svg>
  );
}

function MeetMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M5.53 2.13 0 7.75h5.53zm.398 0v5.62h7.608v3.65l5.47-4.45c-.014-1.22.031-2.25-.025-3.46-.148-1.09-1.287-1.47-2.236-1.36zM23.1 4.32c-.802.295-1.358.995-2.047 1.49-2.506 2.05-4.982 4.12-7.468 6.19 3.025 2.59 6.04 5.18 9.065 7.76 1.218.671 1.428-.814 1.328-1.64v-13a.828.828 0 0 0-.877-.825zM.038 8.15v7.7h5.53v-7.7zm13.577 8.1H6.008v5.62c3.864-.006 7.737.011 11.58-.009 1.02-.07 1.618-1.12 1.468-2.07v-2.51l-5.47-4.68v3.65zm-13.577 0c.02 1.44-.041 2.88.033 4.31.162.948 1.158 1.43 2.047 1.31h3.464v-5.62z"
      />
    </svg>
  );
}

function DiscordMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        fill="currentColor"
        d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
      />
    </svg>
  );
}

export function MeetingPlatformIcon({
  platform,
  size = "md",
  className,
}: {
  platform: MeetingPlatform;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const option = getMeetingPlatform(platform);
  const sizeClass =
    size === "sm"
      ? "h-7 w-7"
      : size === "lg"
        ? "h-10 w-10"
        : "h-9 w-9";
  const markClass =
    size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full shadow-sm ring-1 ring-black/10",
        sizeClass,
        option.bgClassName,
        option.markClassName,
        className,
      )}
      aria-hidden
    >
      {platform === "zoom" ? (
        <ZoomMark className={markClass} />
      ) : platform === "meet" ? (
        <MeetMark className={markClass} />
      ) : platform === "discord" ? (
        <DiscordMark className={markClass} />
      ) : (
        <MapPin className={markClass} strokeWidth={2.25} />
      )}
    </span>
  );
}
