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
  ClipboardList,
  Gauge,
  ShieldAlert,
  Workflow,
} from "lucide-react";

import { useNotificationsUi } from "@/context/notifications-ui-context";
import {
  parseStatsCategory,
  type StatsAdminCategory,
} from "@/lib/stats-admin-category";
import { cn } from "@/lib/utils";

export type { StatsAdminCategory };
export { parseStatsCategory };

const ITEMS: {
  id: StatsAdminCategory;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}[] = [
  { id: "usage", label: "사용량", icon: Gauge },
  { id: "pipeline", label: "처리", icon: Workflow },
  { id: "moderation", label: "검열", icon: ShieldAlert },
  { id: "survey", label: "설문", icon: ClipboardList },
];

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** 모바일: 하단보다 위, 선택 칩이 따라가는 추적형 전환. */
export function StatsAdminMobileRail({
  active,
  onChange,
}: {
  active: StatsAdminCategory;
  onChange: (next: StatsAdminCategory) => void;
}) {
  const mounted = useMounted();
  const { open: notificationsOpen } = useNotificationsUi();
  const trackRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Partial<Record<StatsAdminCategory, HTMLButtonElement>>>(
    {},
  );
  const [indicator, setIndicator] = useState({ left: 0, width: 0, ready: false });

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

  if (!mounted || notificationsOpen) return null;

  return createPortal(
    <nav
      className="pointer-events-none fixed inset-x-0 z-[55] md:hidden"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.75rem)",
      }}
      aria-label="통계 분류 전환"
    >
      <div className="pointer-events-auto mx-auto w-full max-w-lg px-4">
        <div
          ref={trackRef}
          className={cn(
            "relative grid grid-cols-4 gap-1 rounded-full bg-card/95 p-1.5 shadow-soft ring-1 ring-inset ring-border",
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
                onClick={() => onChange(item.id)}
                className={cn(
                  "relative z-10 flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-full px-1 py-2",
                  "text-base font-semibold transition-colors duration-200",
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

export const STATS_CATEGORY_TABS: Array<{
  id: StatsAdminCategory;
  label: string;
}> = [
  { id: "usage", label: "사용량" },
  { id: "pipeline", label: "파이프라인" },
  { id: "moderation", label: "검열" },
  { id: "survey", label: "설문" },
];
