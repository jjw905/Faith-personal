"use client";

import { Check, Eye, EyeOff } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

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

const MASK_OPTIONS: Array<{ value: MaskStyle; label: string }> = [
  { value: "partial", label: "부분 가림" },
  { value: "label", label: "유형 표시" },
  { value: "off", label: "가리지 않음" },
];

/** 부분 가림 / 유형 표시 선택. 실시간 기록 UI용. */
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
  /** 실시간 세션용 — 한 줄 + 샘플 칩 하나 */
  compact?: boolean;
}) {
  return (
    <div className={cn(className)}>
      {showHeading ? (
        <p className="mb-1.5 text-xs font-semibold text-muted-2">
          개인정보 가림
        </p>
      ) : null}
      <div role="radiogroup" aria-label="개인정보 가림 방식" className="flex flex-col">
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
                "flex w-full min-w-0 cursor-pointer items-center justify-between gap-3 rounded-xl text-left transition-colors",
                compact ? "px-2.5 py-2" : "px-3 py-2.5",
                selected ? "bg-surface-2" : "hover:bg-surface-2/60",
              )}
            >
              <span className="flex min-w-0 flex-col gap-1">
                <span
                  className={cn(
                    "text-sm font-semibold",
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
                  className="h-4 w-4 shrink-0 text-foreground"
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
    <div className={cn(className)}>
      {showHeading ? (
        <p className="mb-1.5 text-xs font-semibold text-muted-2">
          개인정보 가림
        </p>
      ) : null}
      <div
        role="tablist"
        aria-label="개인정보 가림 방식"
        className={cn(
          "grid grid-cols-2",
          compact ? "gap-0.5 rounded-xl bg-surface-2 p-0.5" : "gap-1.5",
        )}
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === "partial"}
          onClick={() => onChange("partial")}
          className={cn(
            "flex min-w-0 text-left transition-colors",
            compact
              ? "flex-col items-start gap-0.5 rounded-[10px] px-2.5 py-1.5"
              : "flex-col items-start gap-1.5 rounded-xl px-3 py-2.5",
            value === "partial"
              ? compact
                ? "bg-card text-foreground shadow-sm"
                : "bg-card text-foreground shadow-soft ring-1 ring-foreground/15"
              : "text-muted hover:text-foreground",
            !compact && value !== "partial" && "bg-surface-2",
          )}
        >
          <span
            className={cn(
              "text-xs font-bold",
              value === "partial" ? "text-foreground" : "text-muted",
            )}
          >
            부분 가림
          </span>
          {compact ? (
            <MaskPreviewChip>{MASK_STYLE_SAMPLES.partial.phone}</MaskPreviewChip>
          ) : (
            <span className="flex w-full min-w-0 flex-col gap-1">
              <MaskPreviewChip>
                {MASK_STYLE_SAMPLES.partial.phone}
              </MaskPreviewChip>
              <MaskPreviewChip>
                {MASK_STYLE_SAMPLES.partial.email}
              </MaskPreviewChip>
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === "label"}
          onClick={() => onChange("label")}
          className={cn(
            "flex min-w-0 text-left transition-colors",
            compact
              ? "flex-col items-start gap-0.5 rounded-[10px] px-2.5 py-1.5"
              : "flex-col items-start gap-1.5 rounded-xl px-3 py-2.5",
            value === "label"
              ? compact
                ? "bg-card text-foreground shadow-sm"
                : "bg-card text-foreground shadow-soft ring-1 ring-foreground/15"
              : "text-muted hover:text-foreground",
            !compact && value !== "label" && "bg-surface-2",
          )}
        >
          <span
            className={cn(
              "text-xs font-bold",
              value === "label" ? "text-foreground" : "text-muted",
            )}
          >
            유형 표시
          </span>
          {compact ? (
            <MaskPreviewChip>{MASK_STYLE_SAMPLES.label.phone}</MaskPreviewChip>
          ) : (
            <span className="flex w-full min-w-0 flex-col gap-1">
              <MaskPreviewChip>{MASK_STYLE_SAMPLES.label.phone}</MaskPreviewChip>
              <MaskPreviewChip>{MASK_STYLE_SAMPLES.label.email}</MaskPreviewChip>
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

/** 필요할 때만 여는 가림 방식 팝업. */
export function MaskStylePopup({
  value,
  onChange,
  className,
  forceOpen,
}: {
  value: MaskStyle;
  onChange: (next: MaskStyle) => void;
  className?: string;
  /** 디자인 랩: 패널 항상 열림 */
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(forceOpen));
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const panelOpen = forceOpen || open;

  useEffect(() => {
    if (!panelOpen || forceOpen) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
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
  }, [panelOpen, forceOpen]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={panelOpen}
        aria-controls={panelId}
        aria-label="개인정보 가림 방식"
        title={value === "off" ? "가림 꺼짐" : "가림 방식"}
        onClick={() => {
          if (forceOpen) return;
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors",
          panelOpen
            ? "bg-primary text-primary-foreground shadow-soft"
            : "text-muted hover:bg-surface-2 hover:text-foreground",
        )}
      >
        {value === "off" ? (
          <Eye className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <EyeOff className="h-4 w-4" strokeWidth={1.75} />
        )}
      </button>

      {panelOpen ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="개인정보 가림 방식"
          className="absolute right-0 top-[calc(100%+0.4rem)] z-40 w-[min(100vw-2rem,16rem)] rounded-2xl border border-border bg-card p-1.5 shadow-[0_16px_40px_rgba(17,24,46,0.14)]"
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
      ) : null}
    </div>
  );
}
