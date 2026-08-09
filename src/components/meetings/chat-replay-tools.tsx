"use client";

import {
  Download,
  Highlighter,
  MoreVertical,
  Share2,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { MaskStylePopup } from "@/components/meetings/mask-style-picker";
import {
  exportMeetingDownload,
} from "@/components/meetings/meeting-record-actions";
import { MeetingRecordsActionDialog } from "@/components/meetings/meeting-records-action-dialog";
import type { ChatReplaySettings } from "@/components/meetings/meeting-chat-replay-bar";
import type { MeetingExportFormat } from "@/lib/meeting-export";
import {
  buildMeetingShareUrl,
  shareMeetingLink,
} from "@/lib/meeting-share";
import type { MaskStyle } from "@/lib/masking/types";
import { cn } from "@/lib/utils";
import type { Meeting } from "@/types/meeting";
import type { MeetingTranscript } from "@/types/transcript";

const toolBtn =
  "inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-95 motion-reduce:active:scale-100 md:h-10 md:w-10";

function ReplayToggleBtn({
  pressed,
  label,
  onClick,
  className,
  children,
}: {
  pressed: boolean;
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        toolBtn,
        pressed
          ? "bg-foreground text-background shadow-soft"
          : "bg-card text-muted hover:bg-surface-2 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ToolIconBtn({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        toolBtn,
        "bg-card text-muted hover:bg-surface-2 hover:text-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** 채팅 따라가기 · 단어 포커스 · 다운로드 · 공유 · 마스킹. */
export function ChatReplayTools({
  meeting,
  transcript,
  maskStyle,
  onMaskChange,
  followChat,
  wordFocus,
  onReplaySettingsChange,
}: {
  meeting: Meeting;
  transcript: MeetingTranscript;
  maskStyle: MaskStyle;
  onMaskChange: (next: MaskStyle) => void;
  followChat: boolean;
  wordFocus: boolean;
  onReplaySettingsChange: (partial: Partial<ChatReplaySettings>) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!shareHint) return;
    const t = window.setTimeout(() => setShareHint(null), 1800);
    return () => window.clearTimeout(t);
  }, [shareHint]);

  async function onShare(maskStyle: MaskStyle) {
    if (meeting.workspace === "team") {
      try {
        const response = await fetch(
          `/api/team-meetings/${encodeURIComponent(meeting.id)}/share`,
          { method: "POST" },
        );
        const data = (await response.json()) as { message?: string };
        if (!response.ok) {
          setShareHint(data.message ?? "팀 기록은 외부로 공유할 수 없습니다");
          return;
        }
      } catch {
        setShareHint("공유 정책을 확인하지 못했습니다");
        return;
      }
    }
    const result = await shareMeetingLink({
      title: meeting.title,
      url: buildMeetingShareUrl(maskStyle),
    });
    if (result === "shared") setShareHint("공유했습니다");
    else if (result === "copied") {
      setShareHint(
        maskStyle === "off"
          ? "원문 링크를 복사했습니다"
          : "마스킹 적용 링크를 복사했습니다",
      );
    }
    else if (result === "failed") setShareHint("공유에 실패했습니다");
  }

  function renderDownloadBtn(className?: string) {
    return (
      <ToolIconBtn
        label="다운로드"
        className={className}
        onClick={() => setDownloadOpen(true)}
      >
        <Download className="h-5 w-5" strokeWidth={1.75} />
      </ToolIconBtn>
    );
  }

  function renderShareBtn(className?: string) {
    return (
      <ToolIconBtn
        label="공유"
        className={className}
        onClick={() => setShareOpen(true)}
      >
        <Share2 className="h-5 w-5" strokeWidth={1.75} />
      </ToolIconBtn>
    );
  }

  return (
    <>
      {/*
        모든 폭: 마스킹 · 다운로드 · 공유는 항상 노출.
        모바일: 따라가기·포커스는 … 메뉴.
        데스크톱: 도구 전부 한 줄.
      */}
      <div className="relative flex items-center justify-end gap-1.5">
        <div className="hidden items-center gap-1.5 md:flex">
          <ReplayToggleBtn
            pressed={followChat}
            label="채팅 따라가기"
            onClick={() => onReplaySettingsChange({ followChat: !followChat })}
          >
            <span className="text-[11px] font-bold tracking-wide">LIVE</span>
          </ReplayToggleBtn>
          <ReplayToggleBtn
            pressed={wordFocus}
            label="단어 포커스"
            onClick={() => onReplaySettingsChange({ wordFocus: !wordFocus })}
          >
            <Highlighter className="h-5 w-5" strokeWidth={1.75} />
          </ReplayToggleBtn>
          <MaskStylePopup value={maskStyle} onChange={onMaskChange} />
          {renderDownloadBtn()}
          {renderShareBtn()}
        </div>

        <div ref={menuRef} className="flex items-center gap-1.5 md:hidden">
          <MaskStylePopup value={maskStyle} onChange={onMaskChange} />
          {renderDownloadBtn()}
          {renderShareBtn()}
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
              className="chat-more-drop absolute right-0 top-[calc(100%+0.4rem)] z-40 flex items-center gap-2 rounded-2xl border border-border bg-card p-1.5 shadow-float"
            >
              <ReplayToggleBtn
                pressed={followChat}
                label="채팅 따라가기"
                className="bg-surface"
                onClick={() =>
                  onReplaySettingsChange({ followChat: !followChat })
                }
              >
                <span className="text-[11px] font-bold tracking-wide">LIVE</span>
              </ReplayToggleBtn>
              <ReplayToggleBtn
                pressed={wordFocus}
                label="단어 포커스"
                className="bg-surface"
                onClick={() =>
                  onReplaySettingsChange({ wordFocus: !wordFocus })
                }
              >
                <Highlighter className="h-5 w-5" strokeWidth={1.75} />
              </ReplayToggleBtn>
            </div>
          ) : null}
        </div>

        {shareHint ? (
          <p
            role="status"
            className="absolute right-0 top-[calc(100%+0.35rem)] z-40 whitespace-nowrap rounded-xl bg-foreground px-3 py-1.5 text-sm font-medium text-background shadow-soft"
          >
            {shareHint}
          </p>
        ) : null}
      </div>

      <MeetingRecordsActionDialog
        open={downloadOpen}
        mode="download"
        meetings={[meeting]}
        busy={false}
        onCancel={() => setDownloadOpen(false)}
        onConfirm={(format?: MeetingExportFormat, maskStyle?: MaskStyle) => {
          void exportMeetingDownload(
            { meeting, transcript },
            format ?? "txt",
            maskStyle ?? "partial",
          );
          setDownloadOpen(false);
        }}
      />
      <MeetingRecordsActionDialog
        open={shareOpen}
        mode="share"
        meetings={[meeting]}
        busy={false}
        onCancel={() => setShareOpen(false)}
        onConfirm={(_format, maskStyle) => {
          setShareOpen(false);
          void onShare(maskStyle ?? "partial");
        }}
      />
    </>
  );
}
