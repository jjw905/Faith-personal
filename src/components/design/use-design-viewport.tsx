"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

export const DESIGN_VIEWPORTS = [
  { id: "mobile", label: "모바일", width: 390 },
  { id: "tablet", label: "태블릿", width: 768 },
  { id: "desktop", label: "데스크톱", width: 1024 },
] as const;

export type DesignViewportId = (typeof DESIGN_VIEWPORTS)[number]["id"];

const STORAGE_KEY = "faith.design-viewport";

/** 장면 리마운트 시 깜빡임 방지 (같은 탭 세션). */
let sessionViewport: DesignViewportId | null = null;

function isViewportId(value: string): value is DesignViewportId {
  return DESIGN_VIEWPORTS.some((v) => v.id === value);
}

function readStoredViewport(): DesignViewportId {
  if (sessionViewport) return sessionViewport;
  if (typeof window === "undefined") return "mobile";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && isViewportId(raw)) {
      sessionViewport = raw;
      return raw;
    }
  } catch {
    // private mode 등
  }
  return "mobile";
}

/** 디자인/인증 미리보기 창 크기 — 장면 전환, 새로고침 후에도 유지. */
export function useDesignViewport() {
  const [viewport, setViewportState] =
    useState<DesignViewportId>(readStoredViewport);

  function setViewport(id: DesignViewportId) {
    sessionViewport = id;
    setViewportState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  }

  const width =
    DESIGN_VIEWPORTS.find((v) => v.id === viewport)?.width ?? 390;

  return { viewport, setViewport, width };
}

/**
 * 고정 뷰포트 폭으로 렌더. 컨테이너가 더 좁으면 고정폭+축소 대신
 * fluid(100%)로 내려 히트 영역 어긋남(transform/zoom)을 피한다.
 */
export function DesignViewportStage({
  width,
  children,
  className,
}: {
  width: number;
  children: ReactNode;
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(0);

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    const update = () => setContainerW(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fits = containerW <= 0 || containerW >= width;

  return (
    <div
      ref={outerRef}
      className={cn(
        "h-full w-full min-w-0 overflow-x-hidden overflow-y-auto",
        className,
      )}
    >
      <div
        className="mx-auto min-h-full"
        style={{
          width: fits ? width : "100%",
          maxWidth: width,
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** 모바일 / 태블릿 / 데스크톱 선택. */
export function DesignViewportPicker({
  value,
  onChange,
}: {
  value: DesignViewportId;
  onChange: (id: DesignViewportId) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 px-4 py-3"
      role="group"
      aria-label="미리보기 너비"
    >
      <span className="text-base text-muted">창 크기</span>
      <div className="flex flex-wrap gap-2">
        {DESIGN_VIEWPORTS.map((v) => {
          const active = v.id === value;
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(v.id)}
              className={cn(
                "inline-flex min-h-12 items-center rounded-xl px-4 text-base font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted ring-1 ring-border hover:bg-surface hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
