"use client";

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type TocItem = { id: string; title: string };

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** 모바일: 화면 하단보다 조금 위에 고정, 가로 스크롤 목차. */
export function DocsMobileTocRail({
  items,
  activeId,
  onNavClick,
  emptyLabel,
  ariaLabel,
}: {
  items: TocItem[];
  activeId: string | null;
  onNavClick: (e: MouseEvent<HTMLAnchorElement>, id: string) => void;
  emptyLabel?: string;
  ariaLabel: string;
}) {
  const mounted = useMounted();
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeId || !scrollerRef.current) return;
    const chip = scrollerRef.current.querySelector<HTMLElement>(
      `[data-toc-id="${activeId}"]`,
    );
    if (!chip) return;
    chip.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [activeId]);

  if (!mounted) return null;

  return createPortal(
    <nav
      className="pointer-events-none fixed inset-x-0 z-[55] md:hidden"
      style={{
        // 홈 인디케이터, 제스처 영역 위로 올려 고정
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.75rem)",
      }}
      aria-label={ariaLabel}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-5xl px-3">
        <div
          ref={scrollerRef}
          className={cn(
            "flex gap-2 overflow-x-auto px-0 py-1",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          {items.length === 0 ? (
            <p className="px-3 py-1.5 text-base text-muted">{emptyLabel}</p>
          ) : (
            items.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                data-toc-id={item.id}
                onClick={(e) => onNavClick(e, item.id)}
                className={cn(
                  "block shrink-0 whitespace-nowrap rounded-full border px-3 py-2 text-base transition-[color,background-color,box-shadow,scale] duration-200 ease-out",
                  // MD3 FilterChip: selected = surface/card, unselected = surfaceVariant
                  // 크기 변화는 scale만 (font-size 전환 시 떨림 방지)
                  activeId === item.id
                    ? "scale-105 border-border bg-card font-semibold text-foreground shadow-sm"
                    : "scale-100 border-border bg-surface font-medium text-muted hover:text-foreground",
                )}
              >
                {item.title}
              </a>
            ))
          )}
        </div>
      </div>
    </nav>,
    document.body,
  );
}

/** 데스크톱 사이드 목차 링크 (스크롤 추적 활성 강조). */
export function DocsTocLink({
  id,
  title,
  active,
  onNavClick,
}: {
  id: string;
  title: string;
  active: boolean;
  onNavClick: (e: MouseEvent<HTMLAnchorElement>, id: string) => void;
}) {
  return (
    <a
      href={`#${id}`}
      onClick={(e) => onNavClick(e, id)}
      aria-current={active ? "true" : undefined}
      className={cn(
        // font-size는 보간 시 레이아웃 떨림 → 고정 크기 + scale/color만 전환
        "block origin-left rounded-lg px-2 py-1.5 text-base transition-[color,scale] duration-200 ease-out",
        active
          ? "scale-105 font-semibold text-foreground"
          : "scale-100 font-medium text-muted hover:text-foreground",
      )}
    >
      {title}
    </a>
  );
}

/** 데스크톱 사이드 목차 그룹. */
export function DocsDesktopToc({
  children,
  ariaLabel,
  stickyTopClass,
}: {
  children: ReactNode;
  ariaLabel: string;
  stickyTopClass: string;
}) {
  return (
    <aside className="hidden min-w-0 md:block md:w-48 md:shrink-0 lg:w-52">
      <nav className={cn("min-w-0 md:sticky", stickyTopClass)} aria-label={ariaLabel}>
        {children}
      </nav>
    </aside>
  );
}
