"use client";

import { Download, EyeOff, MoreVertical, StickyNote, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { MaskStylePicker, MaskStylePopup } from "@/components/meetings/mask-style-picker";
import {
  exportMeetingDownload,
} from "@/components/meetings/meeting-record-actions";
import { MeetingRecordsActionDialog } from "@/components/meetings/meeting-records-action-dialog";
import type { MaskStyle } from "@/lib/masking/types";
import { cn } from "@/lib/utils";
import type { Meeting } from "@/types/meeting";
import type { MeetingTranscript } from "@/types/transcript";

const toolBtn =
  "inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-95 motion-reduce:active:scale-100 md:h-10 md:w-10";

/** 마스킹 + 메모. 모바일은 … 드롭다운, 데스크톱은 좌측 전개. */
export function ChatReplayTools({
  meeting,
  transcript,
  maskStyle,
  onMaskChange,
  memoMode,
  onMemoModeChange,
}: {
  meeting: Meeting;
  transcript: MeetingTranscript;
  maskStyle: MaskStyle;
  onMaskChange: (next: MaskStyle) => void;
  memoMode: boolean;
  onMemoModeChange: (next: boolean) => void;
}) {
  const [railOpen, setRailOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!railOpen) return;
    function onDoc(e: MouseEvent) {
      if (railRef.current?.contains(e.target as Node)) return;
      setRailOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRailOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [railOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <>
      {/* 모바일: 세로 … → 다운로드 + 개인 마스킹 */}
      <div ref={menuRef} className="relative md:hidden">
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuOpen ? "메뉴 닫기" : "더보기"}
          title={menuOpen ? "닫기" : "더보기"}
          onClick={() => setMenuOpen((v) => !v)}
          className={cn(
            toolBtn,
            menuOpen
              ? "bg-foreground text-background shadow-soft"
              : "bg-card text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          {menuOpen ? (
            <X className="h-6 w-6" strokeWidth={1.75} />
          ) : (
            <MoreVertical className="h-6 w-6" strokeWidth={1.75} />
          )}
        </button>

        {menuOpen ? (
          <div
            id={menuId}
            role="menu"
            aria-label="다시듣기 메뉴"
            className="chat-more-drop absolute right-0 top-[calc(100%+0.4rem)] z-40 w-[min(18.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-border bg-card p-2 shadow-float"
          >
            <button
              type="button"
              role="menuitem"
              className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-base font-semibold text-foreground transition-colors hover:bg-surface-2 active:scale-[0.99]"
              onClick={() => {
                setMenuOpen(false);
                setDownloadOpen(true);
              }}
            >
              <Download className="h-5 w-5 shrink-0 text-muted" strokeWidth={1.75} />
              다운로드
            </button>

            <div className="mt-1 rounded-xl bg-surface-2/50 p-2">
              <p className="mb-1 px-1 text-sm font-semibold text-muted">
                개인정보 가림
              </p>
              <MaskStylePicker
                value={maskStyle}
                onChange={onMaskChange}
                showHeading={false}
                compact
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* 데스크톱: 메모 + 가림 좌측 전개 */}
      <div ref={railRef} className="hidden items-center justify-end md:flex">
        <div
          key={railOpen ? "tools-open" : "tools-closed"}
          className={cn(
            "flex items-center justify-end gap-1.5 overflow-hidden transition-[max-width,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            railOpen
              ? "mr-1.5 max-w-[7.5rem] opacity-100"
              : "pointer-events-none max-w-0 opacity-0",
          )}
          aria-hidden={!railOpen}
        >
          <button
            type="button"
            aria-pressed={memoMode}
            aria-label="말풍선 메모"
            title="말풍선 메모"
            onClick={() => onMemoModeChange(!memoMode)}
            className={cn(
              toolBtn,
              "chat-tool-slide",
              memoMode
                ? "bg-primary text-primary-foreground shadow-soft"
                : "bg-card text-muted hover:bg-surface-2 hover:text-foreground",
            )}
          >
            <StickyNote className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <div className="chat-tool-slide shrink-0" style={{ animationDelay: "40ms" }}>
            <MaskStylePopup value={maskStyle} onChange={onMaskChange} />
          </div>
        </div>

        <button
          type="button"
          aria-expanded={railOpen}
          aria-label={railOpen ? "도구 닫기" : "메모·가림 도구"}
          title={railOpen ? "도구 닫기" : "메모·가림"}
          onClick={() => setRailOpen((v) => !v)}
          className={cn(
            toolBtn,
            railOpen
              ? "bg-foreground text-background shadow-soft"
              : "bg-card text-muted hover:bg-surface-2 hover:text-foreground",
          )}
        >
          {railOpen ? (
            <X className="h-5 w-5" strokeWidth={1.75} />
          ) : (
            <EyeOff className="h-5 w-5" strokeWidth={1.75} />
          )}
        </button>
      </div>

      <MeetingRecordsActionDialog
        open={downloadOpen}
        mode="download"
        meetings={[meeting]}
        busy={false}
        onCancel={() => setDownloadOpen(false)}
        onConfirm={() => {
          exportMeetingDownload({ meeting, transcript });
          setDownloadOpen(false);
        }}
      />
    </>
  );
}
