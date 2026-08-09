"use client";

import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  TEAM_PREVIEW_ROLE_LABEL,
  TEAM_PREVIEW_ROLES,
  useTeamRolePreview,
} from "@/context/team-role-preview-context";
import { cn } from "@/lib/utils";

const POS_STORAGE_KEY = "faith.page-ux-preview-dock";

type DockPos = { left: number; bottom: number };

function defaultBottom(pathname: string) {
  const aboveMobileBar =
    pathname === "/dashboard" ||
    pathname === "/meetings" ||
    pathname === "/vault" ||
    pathname.startsWith("/team");
  // md 미만에서 추적 바 위 여유, md+ 는 20px
  if (typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches) {
    return 20;
  }
  return aboveMobileBar ? 108 : 16;
}

function defaultLeft() {
  if (typeof window === "undefined") return 12;
  return window.matchMedia("(min-width: 640px)").matches ? 20 : 12;
}

function readStoredPos(): DockPos | null {
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DockPos>;
    if (
      typeof parsed.left !== "number" ||
      typeof parsed.bottom !== "number" ||
      !Number.isFinite(parsed.left) ||
      !Number.isFinite(parsed.bottom)
    ) {
      return null;
    }
    return { left: parsed.left, bottom: parsed.bottom };
  } catch {
    return null;
  }
}

function clampPos(pos: DockPos, size: { w: number; h: number }): DockPos {
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - size.w - margin);
  const maxBottom = Math.max(margin, window.innerHeight - size.h - margin);
  return {
    left: Math.min(maxLeft, Math.max(margin, pos.left)),
    bottom: Math.min(maxBottom, Math.max(margin, pos.bottom)),
  };
}

/** 관리자: 화면 UX + 팀 역할 미리보기. 핸들로 위치 이동 가능. */
export function PageUxPreviewControl() {
  const pathname = usePathname();
  const { enabled, supported, surface, scenario, next, prev, isLive } =
    usePageUxPreview();
  const {
    enabled: roleEnabled,
    activeOnPage: roleActive,
    previewRole,
    setPreviewRole,
  } = useTeamRolePreview();

  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<DockPos | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originBottom: number;
  } | null>(null);

  const showUx = enabled && supported;
  const showRole = roleEnabled && roleActive;

  useEffect(() => {
    if (!showUx && !showRole) return;
    const stored = readStoredPos();
    const nextPos =
      stored ??
      ({
        left: defaultLeft(),
        bottom: defaultBottom(pathname),
      } satisfies DockPos);
    const el = rootRef.current;
    const size = {
      w: el?.offsetWidth ?? 280,
      h: el?.offsetHeight ?? 48,
    };
    setPos(clampPos(nextPos, size));
  }, [pathname, showUx, showRole]);

  useEffect(() => {
    if (!pos) return;
    function onResize() {
      const el = rootRef.current;
      if (!el) return;
      setPos((current) =>
        current
          ? clampPos(current, { w: el.offsetWidth, h: el.offsetHeight })
          : current,
      );
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [pos]);

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      const el = rootRef.current;
      if (!el || !pos) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originLeft: pos.left,
        originBottom: pos.bottom,
      };
      setDragging(true);
    },
    [pos],
  );

  const onHandlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      const el = rootRef.current;
      if (!drag || !el || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      const nextPos = clampPos(
        {
          left: drag.originLeft + dx,
          bottom: drag.originBottom - dy,
        },
        { w: el.offsetWidth, h: el.offsetHeight },
      );
      setPos(nextPos);
    },
    [],
  );

  const endDrag = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
    dragRef.current = null;
    setDragging(false);
    setPos((current) => {
      if (!current) return current;
      try {
        localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(current));
      } catch {
        // ignore quota
      }
      return current;
    });
  }, []);

  if (!showUx && !showRole) return null;

  return (
    <div
      ref={rootRef}
      className={cn(
        "pointer-events-none fixed z-[90] flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-start gap-2",
        dragging && "select-none",
      )}
      style={
        pos
          ? { left: pos.left, bottom: pos.bottom, right: "auto", top: "auto" }
          : {
              left: defaultLeft(),
              bottom: defaultBottom(pathname),
            }
      }
    >
      <button
        type="button"
        className={cn(
          "pointer-events-auto inline-flex h-10 min-h-12 min-w-12 cursor-grab items-center justify-center rounded-full bg-card text-muted shadow-float ring-1 ring-border transition-colors hover:bg-surface hover:text-foreground active:cursor-grabbing md:min-h-10 md:min-w-10",
          dragging && "cursor-grabbing ring-primary/40",
        )}
        aria-label="미리보기 위치 이동"
        title="드래그해서 위치 이동"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <GripVertical className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </button>

      {showUx ? (
        <div
          className={cn(
            "pointer-events-auto inline-flex h-10 max-w-full items-center gap-0.5 rounded-full bg-card px-1 shadow-float ring-1 ring-border",
            !isLive && "ring-primary/30",
          )}
          role="group"
          aria-label={`${surface.label} UX 미리보기`}
        >
          <button
            type="button"
            onClick={prev}
            className="inline-flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface md:h-9 md:w-9 md:min-h-9 md:min-w-9"
            aria-label="이전 UX 상태"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          </button>
          <span className="min-w-0 max-w-[10rem] select-none truncate px-0.5 text-center text-sm font-semibold text-foreground sm:max-w-[14rem]">
            <span className="text-muted">{surface.label}</span>
            <span className="mx-1 text-muted-2">,</span>
            {scenario.label}
          </span>
          <button
            type="button"
            onClick={next}
            className="inline-flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface md:h-9 md:w-9 md:min-h-9 md:min-w-9"
            aria-label="다음 UX 상태"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      ) : null}

      {showRole ? (
        <div
          className={cn(
            "pointer-events-auto inline-flex h-10 max-w-full items-center gap-0.5 rounded-full bg-card p-1 shadow-float ring-1 ring-border",
            previewRole && "ring-primary/30",
          )}
          role="group"
          aria-label="팀 역할 미리보기"
        >
          <button
            type="button"
            aria-pressed={previewRole === null}
            onClick={() => setPreviewRole(null)}
            className={cn(
              "min-h-12 rounded-full px-3 text-base font-semibold transition-colors md:min-h-9 md:text-sm",
              previewRole === null
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            실제
          </button>
          {TEAM_PREVIEW_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              aria-pressed={previewRole === role}
              onClick={() => setPreviewRole(role)}
              className={cn(
                "min-h-12 rounded-full px-3 text-base font-semibold transition-colors md:min-h-9 md:text-sm",
                previewRole === role
                  ? "bg-primary text-primary-foreground"
                  : "text-muted hover:bg-surface hover:text-foreground",
              )}
            >
              {TEAM_PREVIEW_ROLE_LABEL[role]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
