"use client";

import { Check } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { MaterialSymbol } from "@/components/ui/material-symbol";
import { labelFor } from "@/lib/masking/mask-style";
import type { MaskStyle } from "@/lib/masking/types";
import { cn } from "@/lib/utils";

/** 가림 방식 미리보기 칩 — 말풍선 마스킹과 같은 톤 */
function MaskPreviewChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block max-w-full truncate rounded-md bg-masked-soft px-1.5 font-mono text-xs font-semibold leading-5 text-masked">
      {children}
    </span>
  );
}

/** 실제 마스킹 결과와 같은 미리보기 샘플 */
const MASK_STYLE_SAMPLES = {
  partial: {
    phone: "010-****-3916",
    email: "s*********e@partner.co.kr",
  },
  label: {
    phone: labelFor("phone"),
    email: labelFor("email"),
  },
  off: {
    phone: "010-2456-3916",
    email: "sunhyeeee@partner.co.kr",
  },
} as const;

const MASK_OPTIONS: Array<{
  value: MaskStyle;
  label: string;
  /** Material Symbol name */
  symbol: string;
}> = [
  {
    value: "partial",
    label: "부분 가림",
    symbol: "password",
  },
  {
    value: "label",
    label: "유형 표시",
    symbol: "label",
  },
  {
    value: "off",
    label: "가리지 않음",
    symbol: "visibility",
  },
];

function MaskStyleIcon({
  symbol,
  active,
  size = 24,
}: {
  symbol: string;
  active?: boolean;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-surface-2 text-foreground",
      )}
    >
      <MaterialSymbol name={symbol} size={size} weight={active ? 500 : 400} />
    </span>
  );
}

/** 부분 가림 / 유형 표시 / 가리지 않음. */
export function MaskStylePicker({
  value,
  onChange,
  className,
  showHeading = true,
  compact = false,
}: {
  value: MaskStyle;
  onChange: (next: MaskStyle) => void;
  className?: string;
  showHeading?: boolean;
  /** 한 줄 요약 + 아이콘 강조 */
  compact?: boolean;
}) {
  return (
    <div className={cn(className)}>
      {showHeading ? (
        <p className="mb-1.5 text-sm font-semibold text-muted">
          개인정보 가림
        </p>
      ) : null}
      <div
        role="radiogroup"
        aria-label="개인정보 가림 방식"
        className="flex flex-col gap-0.5"
      >
        {MASK_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex w-full min-w-0 cursor-pointer items-center gap-3 rounded-2xl text-left transition-colors",
                compact ? "min-h-14 px-2 py-2" : "min-h-14 px-2.5 py-2.5",
                selected ? "bg-surface-2" : "hover:bg-surface-2/60",
              )}
            >
              <MaskStyleIcon symbol={option.symbol} active={selected} />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span
                  className={cn(
                    "text-base font-semibold",
                    selected ? "text-foreground" : "text-muted",
                  )}
                >
                  {option.label}
                </span>
                <MaskPreviewChip>
                  {MASK_STYLE_SAMPLES[option.value].phone}
                </MaskPreviewChip>
              </span>
              {selected ? (
                <Check
                  className="h-5 w-5 shrink-0 text-foreground"
                  strokeWidth={2.25}
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** 이전 2단 배치. 디자인 랩에서만 쓴다. */
export function MaskStylePickerLegacy({
  value,
  onChange,
  className,
  showHeading = true,
  compact = false,
}: {
  value: MaskStyle;
  onChange: (next: MaskStyle) => void;
  className?: string;
  showHeading?: boolean;
  compact?: boolean;
}) {
  return (
    <MaskStylePicker
      value={value}
      onChange={onChange}
      className={className}
      showHeading={showHeading}
      compact={compact}
    />
  );
}

/** 필요할 때만 여는 가림 방식 팝업. 트리거=아이콘 버튼. */
export function MaskStylePopup({
  value,
  onChange,
  className,
  forceOpen,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
  anchorRef,
}: {
  value: MaskStyle;
  onChange: (next: MaskStyle) => void;
  className?: string;
  /** 디자인 랩: 패널 항상 열림 */
  forceOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 트리거 숨김. 외부에서 open으로만 연다 */
  hideTrigger?: boolean;
  /** hideTrigger일 때 위치 기준 */
  anchorRef?: RefObject<HTMLElement | null>;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(Boolean(forceOpen));
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const controlled = openProp !== undefined;
  const panelOpen =
    forceOpen || (controlled ? Boolean(openProp) : uncontrolledOpen);

  const setOpen = useCallback(
    (next: boolean) => {
      if (forceOpen) return;
      if (!controlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [forceOpen, controlled, onOpenChange],
  );

  const [pos, setPos] = useState({ top: 0, left: 0, width: 280 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!panelOpen || forceOpen) return;
    function place() {
      const btn = hideTrigger ? anchorRef?.current : btnRef.current;
      const width = Math.min(280, window.innerWidth - 16);
      if (!btn) {
        setPos({
          top: 72,
          left: Math.max(8, window.innerWidth - width - 12),
          width,
        });
        return;
      }
      const r = btn.getBoundingClientRect();
      const left = Math.min(
        Math.max(8, r.right - width),
        window.innerWidth - width - 8,
      );
      const panelH = panelRef.current?.offsetHeight || 260;
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const openUp =
        spaceBelow < panelH + 16 || r.top > window.innerHeight * 0.55;
      setPos({
        top: openUp ? Math.max(8, r.top - 8 - panelH) : r.bottom + 8,
        left,
        width,
      });
    }
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [panelOpen, forceOpen, hideTrigger, anchorRef]);

  useEffect(() => {
    if (!panelOpen || forceOpen) return;
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef?.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen, forceOpen, anchorRef, setOpen]);

  const activeOption =
    MASK_OPTIONS.find((o) => o.value === value) ?? MASK_OPTIONS[0];

  const panel = panelOpen ? (
    <div
      ref={panelRef}
      id={panelId}
      role="dialog"
      aria-label="개인정보 가림 방식"
      className="z-[70] rounded-2xl border border-border bg-card p-2 shadow-[0_16px_40px_rgba(17,24,46,0.14)]"
      style={
        forceOpen
          ? undefined
          : {
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
            }
      }
    >
      <MaskStylePicker
        value={value}
        onChange={(next) => {
          onChange(next);
          if (!forceOpen) setOpen(false);
        }}
        showHeading={false}
        compact
      />
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className={cn(
        hideTrigger ? "pointer-events-none absolute size-0 overflow-hidden" : "relative",
        className,
      )}
    >
      {hideTrigger ? null : (
        <button
          ref={btnRef}
          type="button"
          aria-expanded={panelOpen}
          aria-controls={panelId}
          aria-label="개인정보 가림 방식"
          title={activeOption.label}
          onClick={() => {
            if (forceOpen) return;
            setOpen(!panelOpen);
          }}
          className={cn(
            "inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full transition-colors md:h-10 md:w-10",
            panelOpen
              ? "bg-primary text-primary-foreground shadow-soft"
              : "bg-card text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          <MaterialSymbol
            name={value === "off" ? "visibility" : "visibility_off"}
            size={22}
            weight={panelOpen ? 500 : 400}
          />
        </button>
      )}

      {forceOpen
        ? panel
          ? (
              <div className="absolute right-0 top-[calc(100%+0.4rem)] z-40 w-[min(100vw-2rem,17.5rem)]">
                {panel}
              </div>
            )
          : null
        : mounted && panel
          ? createPortal(panel, document.body)
          : null}
    </div>
  );
}
