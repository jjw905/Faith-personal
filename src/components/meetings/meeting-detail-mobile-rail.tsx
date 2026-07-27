"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  MessagesSquare,
  Paperclip,
  Sparkles,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

export type MeetingDetailMobilePane =
  | "summary"
  | "people"
  | "timeline"
  | "files"
  | "chat";

const ITEMS: {
  id: MeetingDetailMobilePane;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}[] = [
  { id: "summary", label: "요약", icon: Sparkles },
  { id: "people", label: "참석", icon: Users },
  { id: "timeline", label: "타임라인", icon: FileText },
  { id: "files", label: "첨부", icon: Paperclip },
  { id: "chat", label: "대화", icon: MessagesSquare },
];

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** 모바일: 회의록 구역 추적형 전환. */
export function MeetingDetailMobileRail({
  active,
  onChange,
  chatHref,
  hasAttachments,
}: {
  active: MeetingDetailMobilePane;
  onChange: (next: MeetingDetailMobilePane) => void;
  chatHref: string;
  hasAttachments: boolean;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const trackRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<
    Partial<Record<MeetingDetailMobilePane, HTMLButtonElement>>
  >({});
  const [indicator, setIndicator] = useState({
    left: 0,
    width: 0,
    ready: false,
  });

  function syncIndicator() {
    const track = trackRef.current;
    const btn = btnRefs.current[active];
    if (!track || !btn) return;
    const trackBox = track.getBoundingClientRect();
    const btnBox = btn.getBoundingClientRect();
    setIndicator({
      left: btnBox.left - trackBox.left,
      width: btnBox.width,
      ready: true,
    });
  }

  useLayoutEffect(() => {
    syncIndicator();
  }, [active]);

  useEffect(() => {
    const onResize = () => syncIndicator();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active]);

  if (!mounted) return null;

  return createPortal(
    <nav
      className="pointer-events-none fixed inset-x-0 z-[55] md:hidden"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.75rem)",
      }}
      aria-label="회의록 구역 전환"
    >
      <div className="pointer-events-auto mx-auto w-full max-w-lg px-4">
        <div
          ref={trackRef}
          className={cn(
            "relative grid grid-cols-5 gap-1 rounded-full bg-card/95 p-1.5 shadow-soft ring-1 ring-inset ring-border",
            "backdrop-blur-md",
          )}
          role="tablist"
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-0 top-1.5 bottom-1.5 rounded-full bg-primary",
              indicator.ready
                ? "transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                : "opacity-0",
            )}
            style={{
              width: indicator.width,
              transform: `translateX(${indicator.left}px)`,
            }}
          />
          {ITEMS.map((item) => {
            const selected = active === item.id;
            const Icon = item.icon;
            const disabled = item.id === "files" && !hasAttachments;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  if (el) btnRefs.current[item.id] = el;
                  else delete btnRefs.current[item.id];
                }}
                type="button"
                role="tab"
                aria-selected={selected}
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  if (item.id === "chat") {
                    onChange("chat");
                    router.push(chatHref);
                    return;
                  }
                  onChange(item.id);
                  if (item.id === "summary") scrollToSection("meeting-summary");
                  if (item.id === "people") scrollToSection("meeting-people");
                  if (item.id === "timeline" || item.id === "files") {
                    scrollToSection("meeting-records");
                  }
                }}
                className={cn(
                  "relative z-10 flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-full px-0.5 py-2",
                  "text-sm font-semibold transition-colors duration-200",
                  disabled && "opacity-40",
                  selected
                    ? "text-primary-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>,
    document.body,
  );
}
