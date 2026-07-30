"use client";

import { Download, MoreVertical, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { MaskStylePopup } from "@/components/meetings/mask-style-picker";
import {
  exportMeetingDownload,
} from "@/components/meetings/meeting-record-actions";
import { MeetingRecordsActionDialog } from "@/components/meetings/meeting-records-action-dialog";
import { MaterialSymbol } from "@/components/ui/material-symbol";
import type { MaskStyle } from "@/lib/masking/types";
import { cn } from "@/lib/utils";
import type { Meeting } from "@/types/meeting";
import type { MeetingTranscript } from "@/types/transcript";

const toolBtn =
  "inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-95 motion-reduce:active:scale-100 md:h-10 md:w-10";

/** 마스킹. 모바일은 … → 아이콘, 가림은 아이콘 탭 후 방식 선택. */
export function ChatReplayTools({
  meeting,
  transcript,
  maskStyle,
  onMaskChange,
}: {
  meeting: Meeting;
  transcript: MeetingTranscript;
  maskStyle: MaskStyle;
  onMaskChange: (next: MaskStyle) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [maskOpen, setMaskOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreBtnRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

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
      {/* 모바일: 세로 … → 다운로드 + 가림(아이콘). 가림 탭 시 방식 패널 */}
      <div ref={menuRef} className="relative md:hidden">
        <button
          ref={moreBtnRef}
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
            className="chat-more-drop absolute right-0 top-[calc(100%+0.4rem)] z-40 flex items-center gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-float"
          >
            <button
              type="button"
              role="menuitem"
              aria-label="다운로드"
              title="다운로드"
              className={cn(
                toolBtn,
                "bg-surface text-foreground hover:bg-surface-2",
              )}
              onClick={() => {
                setMenuOpen(false);
                setDownloadOpen(true);
              }}
            >
              <Download className="h-5 w-5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              role="menuitem"
              aria-label="개인정보 가림"
              title="개인정보 가림"
              className={cn(
                toolBtn,
                "bg-surface text-foreground hover:bg-surface-2",
              )}
              onClick={() => {
                setMenuOpen(false);
                setMaskOpen(true);
              }}
            >
              <MaterialSymbol
                name={maskStyle === "off" ? "visibility" : "visibility_off"}
                size={22}
              />
            </button>
          </div>
        ) : null}

        <MaskStylePopup
          value={maskStyle}
          onChange={onMaskChange}
          open={maskOpen}
          onOpenChange={setMaskOpen}
          hideTrigger
          anchorRef={moreBtnRef}
        />
      </div>

      {/* 데스크톱: 가림 방식 (메모는 각 말풍선에 마우스를 올리면 아이콘으로 나옴) */}
      <div className="hidden items-center justify-end md:flex">
        <MaskStylePopup value={maskStyle} onChange={onMaskChange} />
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
