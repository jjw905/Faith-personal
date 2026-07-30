"use client";

import Link from "next/link";
import {
  Archive,
  ArrowLeft,
  Clock3,
  Eye,
  EyeOff,
  FileAudio,
  History,
  MoreHorizontal,
  NotebookPen,
  Paperclip,
  Plus,
  SendHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";

import { MaskedText } from "@/components/meetings/masked-text";
import { CorrectionHint } from "@/components/meetings/correction-hint";
import { MaskStylePopup } from "@/components/meetings/mask-style-picker";
import { VaultPickerDialog } from "@/components/vault/vault-picker";
import { useAppContext } from "@/context/app-context";
import { useAccountDisplayPrefs } from "@/hooks/use-account-display-prefs";
import { useMeetingChrome } from "@/context/meeting-chrome-context";
import { useFileUpload } from "@/hooks/use-file-upload";
import { REALTIME_FEATURE_ENABLED } from "@/lib/feature-flags";
import {
  useRealtimeTranscription,
  type BrowserRealtimeUtterance,
} from "@/hooks/use-realtime-transcription";
import { maskPii, type MaskStyle } from "@/lib/masking";
import { cn } from "@/lib/utils";
import type { TranscriptCorrection } from "@/types/transcript";
import type { VaultItemMeta } from "@/lib/vault";

type Side = "left" | "right";

type ChatMessage = {
  id: string;
  side: Side;
  name: string;
  initial: string;
  team?: string;
  content: string;
  attachment?: {
    name: string;
    sizeLabel: string;
    isTest?: boolean;
  };
  corrections?: TranscriptCorrection[];
};

const SPEAKERS = [
  { side: "left" as const, name: "나", initial: "나" },
  {
    side: "right" as const,
    name: "김서연",
    initial: "김",
    team: "디자인팀",
  },
  {
    side: "right" as const,
    name: "최민준",
    initial: "최",
    team: "개발팀",
  },
  {
    side: "right" as const,
    name: "이도현",
    initial: "이",
    team: "기획팀",
  },
  {
    side: "right" as const,
    name: "박지우",
    initial: "박",
    team: "운영팀",
  },
];

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatElapsed(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** sm 미만: 모바일 하단 컴포저·스피드 다이얼용. */
function useIsMobileComposer() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(max-width: 639px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(max-width: 639px)").matches,
    () => false,
  );
}

/** md 미만: 타임라인 우측 드로어 대신 바텀시트. */
function useIsTimelineSheet() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

/**
 * 키보드가 가리는 하단 높이.
 * iOS: visualViewport height+offsetTop. Android: interactive-widget + 동일 API.
 * safe-area는 키보드가 떠 있을 때 쓰면 이중 여백이 생기므로 호출측에서 끈다.
 */
function useKeyboardBottomInset(enabled: boolean) {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setInset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;
    const update = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const visibleBottom = vv.height + vv.offsetTop;
        setInset(Math.max(0, Math.round(window.innerHeight - visibleBottom)));
      });
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(raf);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [enabled]);

  return inset;
}

function ChatDateDivider({ label }: { label: string }) {
  return (
    <span className="whitespace-nowrap rounded-full bg-surface-2 px-3 py-1 text-[13px] font-semibold tabular-nums tracking-tight text-foreground">
      {label}
    </span>
  );
}

function FileAttachmentCard({
  name,
  sizeLabel,
  isMe,
  isTest,
}: {
  name: string;
  sizeLabel: string;
  isMe: boolean;
  isTest?: boolean;
}) {
  const ext = (name.split(".").pop() ?? "file").toUpperCase();

  return (
    <div
      className={cn(
        "w-[15.75rem] overflow-hidden rounded-2xl text-left shadow-soft",
        isMe
          ? "rounded-bl-md bg-primary text-primary-foreground"
          : "rounded-br-md bg-card text-foreground ring-1 ring-border",
      )}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl",
            isMe ? "bg-white/15" : "bg-surface-2",
          )}
        >
          <FileAudio className="h-4 w-4" strokeWidth={1.75} />
          <span className="mt-0.5 text-[10px] font-bold leading-none tracking-wide opacity-80">
            {ext}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-snug">{name}</p>
          <p
            className={cn(
              "mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-medium",
              isMe ? "text-primary-foreground/75" : "text-muted",
            )}
          >
            <span>오디오</span>
            <span aria-hidden>,</span>
            <span className="tabular-nums">{sizeLabel}</span>
            {isTest ? (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-xs font-bold leading-none",
                  isMe
                    ? "bg-white/15 text-primary-foreground"
                    : "bg-primary-soft text-primary",
                )}
              >
                테스트
              </span>
            ) : null}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ChatBubble({
  side,
  name,
  initial,
  team,
  content,
  attachment,
  corrections,
  maskStyle,
}: {
  side: Side;
  name: string;
  initial: string;
  team?: string;
  content: string;
  attachment?: ChatMessage["attachment"];
  corrections?: TranscriptCorrection[];
  maskStyle: MaskStyle;
}) {
  const isMe = side === "left";
  const matches = content
    ? maskPii(content, { style: maskStyle }).matches
    : [];

  return (
    <div
      className={cn(
        "flex w-full min-w-0 animate-[bubble-in_320ms_ease-out] motion-reduce:animate-none",
        isMe ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "flex max-w-[min(85%,22rem)] items-end gap-2.5",
          isMe ? "flex-row-reverse" : "flex-row",
        )}
      >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          isMe
            ? "bg-primary text-primary-foreground ring-2 ring-primary/20"
            : "bg-surface-2 text-foreground",
        )}
      >
        {initial}
      </div>
      <div
        className={cn(
          "min-w-0",
          isMe ? "text-right" : "text-left",
        )}
      >
        <p
          className={cn(
            "mb-1 flex min-w-0 items-baseline gap-1.5 text-xs font-semibold",
            isMe ? "flex-row-reverse text-primary" : "text-foreground",
          )}
        >
          <span className="truncate">{name}</span>
          {!isMe && team ? (
            <span className="shrink-0 rounded bg-surface-2 px-1.5 py-px text-xs font-medium text-muted">
              {team}
            </span>
          ) : null}
        </p>
        {attachment ? (
          <div className={cn("flex", isMe ? "justify-end" : "justify-start")}>
            <FileAttachmentCard
              name={attachment.name}
              sizeLabel={attachment.sizeLabel}
              isMe={isMe}
              isTest={attachment.isTest}
            />
          </div>
        ) : (
          <div
            className={cn(
              "inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-left text-[14px] font-medium leading-relaxed xl:text-[15px]",
              isMe
                ? "rounded-br-md bg-primary text-primary-foreground"
                : "rounded-bl-md bg-surface text-foreground ring-1 ring-border",
            )}
          >
            <MaskedText
              original={content}
              matches={matches}
              onPrimary={isMe}
            />
          </div>
        )}
        {corrections?.length ? (
          <CorrectionHint
            corrections={corrections}
            align={isMe ? "end" : "start"}
            className="mt-2"
          />
        ) : null}
      </div>
      </div>
    </div>
  );
}

type MemoLine = {
  id: string;
  text: string;
};

type MeetingMemo = {
  title: string;
  subject: string;
  attendees: MemoLine[];
  purpose: MemoLine[];
  notes: MemoLine[];
  decisions: MemoLine[];
  followUps: MemoLine[];
  caution: string;
};

const DEFAULT_MEETING_TITLE = "새 기록";

let memoLineSeq = 0;
function createMemoLine(text: string): MemoLine {
  memoLineSeq += 1;
  return { id: `memo-line-${memoLineSeq}`, text };
}

function createDefaultMeetingMemo(): MeetingMemo {
  return {
    title: "회의 메모",
    subject: "새 회의 인식·레이아웃 검증",
    attendees: ["나", "김서연", "최민준", "이도현", "박지우"].map(createMemoLine),
    purpose: [
      "홈 ChatMock과 동일한 채팅 버블 레이아웃 확인",
      "인식 시작 시 좌측 메뉴 숨김, 우측 시나리오 노출 점검",
      "파일 첨부, 메모 보기 동선이 방해되지 않는지 확인",
    ].map(createMemoLine),
    notes: [
      "민감정보가 나오면 마스킹 칩으로 가려진 뒤 클릭 시에만 원문 확인",
      "시나리오 타임라인은 경과 시간에 맞춰 구간이 순차 개방됨",
    ].map(createMemoLine),
    decisions: [
      "채팅 입력과 녹음 버튼은 같은 행에 배치",
      "파일 첨부·메모는 아래 도구줄에 배치",
    ].map(createMemoLine),
    followUps: [
      "실제 받아쓰기 연동 전, 시나리오 요약 문장 톤을 한 번 더 다듬기",
      "외부 공유 전 메모·타임라인에 개인정보가 남는지 재검수",
    ].map(createMemoLine),
    caution:
      "메모·시나리오 내용은 내부 검증용입니다. 외부 공유 시 마스킹 상태를 확인하세요.",
  };
}

function MemoListSection({
  label,
  items,
  onChange,
  placeholder,
  addLabel,
}: {
  label: string;
  items: MemoLine[];
  onChange: (items: MemoLine[]) => void;
  placeholder: string;
  addLabel: string;
}) {
  function updateItem(id: string, value: string) {
    onChange(items.map((item) => (item.id === id ? { ...item, text: value } : item)));
  }

  function removeItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
  }

  function addItem() {
    const line = createMemoLine("");
    onChange([...items, line]);
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>(
        `[data-memo-line-id="${line.id}"]`,
      );
      el?.focus();
    });
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-muted sm:text-sm">
          {label}
        </h3>
        <button
          type="button"
          onClick={addItem}
          aria-label={`${label} 추가`}
          className="inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-base font-semibold text-primary transition-colors hover:bg-primary-soft sm:min-h-8 sm:px-2 sm:text-sm"
        >
          <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" strokeWidth={2} />
          {addLabel}
        </button>
      </div>
      <ul className="space-y-2">
        {items.length === 0 ? (
          <li className="rounded-xl bg-surface px-3 py-3 text-base text-muted sm:py-2 sm:text-sm">
            항목이 없습니다. 추가로 입력하세요.
          </li>
        ) : (
          items.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <input
                type="text"
                data-memo-line-id={item.id}
                value={item.text}
                onChange={(event) => updateItem(item.id, event.target.value)}
                placeholder={placeholder}
                className="min-h-12 min-w-0 flex-1 rounded-xl bg-surface px-3 py-2 text-base leading-relaxed text-foreground outline-none ring-1 ring-transparent transition-[box-shadow,background-color] placeholder:text-muted focus:bg-card focus:ring-primary/25 sm:min-h-9 sm:text-sm"
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                aria-label={`${label} 항목 삭제`}
                className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl text-masked transition-colors hover:bg-masked-soft sm:h-9 sm:w-9"
              >
                <Trash2 className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function ToolAction({
  label,
  onClick,
  pressed,
  ariaLabel,
  children,
  buttonRef,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  ariaLabel: string;
  children: ReactNode;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={ariaLabel}
        title={label}
        className={cn(
          "relative inline-flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all",
          pressed
            ? "bg-primary text-primary-foreground shadow-soft ring-2 ring-primary/40"
            : "bg-surface-2 text-foreground/70 ring-1 ring-border-strong hover:bg-[#e4e6eb] hover:text-foreground",
        )}
      >
        {children}
      </button>
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 top-[calc(100%+4px)] w-max max-w-[4.5rem] -translate-x-1/2 text-center text-xs font-semibold leading-tight",
          pressed ? "text-primary" : "text-foreground/65",
        )}
      >
        {label}
      </span>
    </div>
  );
}

/** 모바일 스피드 다이얼 아이콘. 라벨은 왼쪽에 붙여 오른손 엄지 존을 가리지 않는다. */
function MobileFabButton({
  label,
  onClick,
  pressed,
  ariaLabel,
  delayMs = 0,
  children,
  buttonRef,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  ariaLabel: string;
  delayMs?: number;
  children: ReactNode;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div
      className="flex items-center justify-end gap-2"
      style={{
        animation: `fab-item-up 220ms cubic-bezier(0.2, 0, 0, 1) ${delayMs}ms both`,
      }}
    >
      <span className="whitespace-nowrap px-1 text-xs font-semibold text-foreground">
        {label}
      </span>
      <button
        ref={buttonRef}
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={ariaLabel}
        title={label}
        className={cn(
          "inline-flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all",
          pressed
            ? "bg-primary text-primary-foreground shadow-soft ring-2 ring-primary/40"
            : "bg-card text-foreground shadow-soft ring-1 ring-border hover:bg-surface-2",
        )}
      >
        {children}
      </button>
    </div>
  );
}

export function RecordBeatBars() {
  return (
    <span className="record-beat-bars text-white" aria-hidden>
      <span />
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}

export function AttachMenuPopup({
  open,
  onAttach,
  onVaultAttach,
  align = "center",
}: {
  open: boolean;
  onAttach: () => void;
  onVaultAttach?: () => void;
  align?: "center" | "end";
}) {
  if (!open) return null;

  return (
    <div
      className={cn(
        "absolute bottom-full z-50 mb-2",
        align === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
      )}
    >
      <div
        role="menu"
        aria-label="파일 첨부 메뉴"
        className="w-56 rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border"
        style={{
          animation: "fab-item-up 220ms cubic-bezier(0.2, 0, 0, 1) both",
        }}
      >
      <button
        type="button"
        role="menuitem"
        onClick={onAttach}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-base font-semibold text-foreground transition-colors hover:bg-surface-2"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground">
          <Upload className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1 truncate">이 기기에서</span>
      </button>
      {onVaultAttach ? (
        <button
          type="button"
          role="menuitem"
          onClick={onVaultAttach}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-base font-semibold text-foreground transition-colors hover:bg-surface-2"
        >
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground">
            <Archive className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1 truncate">보관함에서</span>
        </button>
      ) : null}
      </div>
    </div>
  );
}

export function ResetConfirmDialog({
  open,
  onCancel,
  onConfirm,
  contained,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  contained?: boolean;
}) {
  useEffect(() => {
    if (!open || contained) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onCancel, contained]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-center bg-black/40 p-4",
        contained ? "absolute inset-0 z-10" : "fixed inset-0 z-[70]",
      )}
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-confirm-title"
        aria-describedby="reset-confirm-desc"
        className="w-full max-w-sm rounded-3xl bg-card p-5 shadow-soft ring-1 ring-border"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="reset-confirm-title"
          className="text-base font-bold tracking-tight text-foreground"
        >
          세션을 초기화할까요?
        </h2>
        <p
          id="reset-confirm-desc"
          className="mt-2 text-sm leading-relaxed text-muted"
        >
          채팅, 첨부, 녹음 상태, 타임라인 경과가 모두 삭제됩니다. 이 작업은
          되돌릴 수 없습니다.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl px-4 text-sm font-semibold text-foreground transition-colors hover:bg-surface-2"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl bg-masked px-4 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            초기화
          </button>
        </div>
      </div>
    </div>
  );
}

function formatUtteranceTime(startSec: number) {
  return formatElapsed(Math.max(0, Math.floor(startSec)));
}

function ScenarioPanel({
  elapsedLabel,
  running,
  utterances,
  partialText,
  maskStyle,
  onClose,
  layout = "rail",
}: {
  elapsedLabel: string;
  running: boolean;
  utterances: BrowserRealtimeUtterance[];
  partialText: string;
  maskStyle: MaskStyle;
  onClose: () => void;
  /** sheet: 모바일 바텀시트. rail: md+ 우측 패널. */
  layout?: "sheet" | "rail";
}) {
  const hasContent = utterances.length > 0 || Boolean(partialText);
  const isSheet = layout === "sheet";

  const body = (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      {!hasContent ? (
        <p className="rounded-xl bg-surface px-3 py-3 text-base leading-relaxed text-muted">
          {running
            ? "발화를 기다리는 중입니다."
            : "인식을 시작하면 발화 시간순으로 타임라인이 생성됩니다."}
        </p>
      ) : (
        <ol className="space-y-3">
          {utterances.map((utterance) => {
            const matches = utterance.text
              ? maskPii(utterance.text, { style: maskStyle }).matches
              : [];
            return (
              <li key={utterance.itemId} className="flex gap-2.5">
                <span className="mt-0.5 shrink-0 font-mono text-base tabular-nums text-muted">
                  {formatUtteranceTime(utterance.startSec)}
                </span>
                <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-base leading-relaxed text-foreground">
                  <MaskedText original={utterance.text} matches={matches} />
                </p>
              </li>
            );
          })}
          {partialText ? (
            <li className="flex gap-2.5 opacity-60">
              <span className="mt-0.5 shrink-0 font-mono text-base tabular-nums text-muted">
                {elapsedLabel}
              </span>
              <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-base leading-relaxed text-foreground">
                {partialText}
              </p>
            </li>
          ) : null}
        </ol>
      )}
    </div>
  );

  if (isSheet) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end bg-black/40 md:hidden"
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="타임라인"
          className="flex h-[66.666dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-card shadow-float"
          style={{
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex shrink-0 justify-center pb-1 pt-3" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-border" />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 pb-3 pt-1">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">타임라인</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-base text-muted">
                <Clock3
                  className={cn("h-4 w-4 shrink-0", running && "animate-spin")}
                  strokeWidth={1.75}
                />
                <span className="font-mono tabular-nums">{elapsedLabel}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="타임라인 닫기"
              className="inline-flex h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-xl bg-surface-2 px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface"
            >
              <X className="h-5 w-5" strokeWidth={1.75} />
              닫기
            </button>
          </div>
          {body}
        </div>
      </div>
    );
  }

  return (
    <aside
      aria-label="타임라인"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-card"
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">타임라인</h2>
          <p className="mt-0.5 text-sm leading-relaxed text-muted">
            발화 시간순 자동 생성
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1 font-mono text-sm tabular-nums text-muted">
            <Clock3
              className={cn("h-3.5 w-3.5", running && "animate-spin")}
              strokeWidth={1.75}
            />
            {elapsedLabel}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="타임라인 숨기기"
            className="inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground md:h-8 md:w-8"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
      {body}
    </aside>
  );
}

function MeetingMemoPanel({
  open,
  onClose,
  memo,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  memo: MeetingMemo;
  onChange: (next: MeetingMemo) => void;
}) {
  const isMobile = useIsMobileComposer();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    if (isMobile) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (isMobile) document.body.style.overflow = "";
    };
  }, [open, onClose, isMobile]);

  if (!open) return null;

  function patch(partial: Partial<MeetingMemo>) {
    onChange({ ...memo, ...partial });
  }

  const fields = (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4">
      <MemoListSection
        label="참석"
        items={memo.attendees}
        onChange={(attendees) => patch({ attendees })}
        placeholder="참석자 이름"
        addLabel="추가"
      />
      <MemoListSection
        label="목적"
        items={memo.purpose}
        onChange={(purpose) => patch({ purpose })}
        placeholder="목적 항목"
        addLabel="추가"
      />
      <MemoListSection
        label="핵심 메모"
        items={memo.notes}
        onChange={(notes) => patch({ notes })}
        placeholder="메모 항목"
        addLabel="추가"
      />
      <MemoListSection
        label="결정"
        items={memo.decisions}
        onChange={(decisions) => patch({ decisions })}
        placeholder="결정 사항"
        addLabel="추가"
      />
      <MemoListSection
        label="후속"
        items={memo.followUps}
        onChange={(followUps) => patch({ followUps })}
        placeholder="후속 조치"
        addLabel="추가"
      />
      <section className="rounded-2xl bg-warning-soft px-3 py-3">
        <h3 className="text-base font-semibold text-warning sm:text-sm">주의</h3>
        <textarea
          value={memo.caution}
          onChange={(event) => patch({ caution: event.target.value })}
          rows={3}
          className="mt-1.5 w-full resize-y rounded-xl bg-transparent px-0 py-1 text-base leading-relaxed text-foreground/90 outline-none sm:text-sm"
          placeholder="주의 사항"
        />
      </section>
    </div>
  );

  const headerFields = (
    <div className="min-w-0 flex-1">
      <input
        type="text"
        value={memo.title}
        onChange={(event) => patch({ title: event.target.value })}
        aria-label="메모 제목"
        className="w-full bg-transparent text-lg font-semibold text-foreground outline-none placeholder:text-muted sm:text-base"
        placeholder="회의 메모"
      />
      <input
        type="text"
        value={memo.subject}
        onChange={(event) => patch({ subject: event.target.value })}
        aria-label="메모 주제"
        className="mt-1 w-full bg-transparent text-base text-muted outline-none placeholder:text-muted/70 sm:text-sm"
        placeholder="주제"
      />
    </div>
  );

  if (isMobile) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end bg-black/40"
        role="presentation"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="회의 메모"
          className="flex h-[66.666dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-card shadow-float"
          style={{
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex shrink-0 justify-center pb-1 pt-3" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-border" />
          </div>
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 pb-3 pt-1">
            {headerFields}
            <button
              type="button"
              onClick={onClose}
              aria-label="메모 닫기"
              className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              <X className="h-5 w-5" strokeWidth={1.75} />
            </button>
          </div>
          {fields}
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="회의 메모"
      className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[22rem] flex-col overflow-hidden rounded-2xl bg-card shadow-soft sm:w-[22rem]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        {headerFields}
        <button
          type="button"
          onClick={onClose}
          aria-label="메모 닫기"
          className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground md:h-8 md:w-8"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
      {fields}
    </div>
  );
}

/** 홈 ChatMock 레이아웃을 따른 새 회의 실시간 세션. */
export function NewMeetingSession() {
  const { setFocusMode } = useMeetingChrome();
  const { autoOpenTimelineOnStart } = useAppContext();
  const {
    isRecording,
    partialText,
    utterances: realtimeUtterances,
    error: realtimeError,
    meetingHref,
    start: startRealtime,
    stop: stopRealtime,
    reset: resetRealtime,
  } = useRealtimeTranscription();
  const {
    acceptedFormats,
    handleFileSelect,
    isDragging,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = useFileUpload();

  const [inMeeting, setInMeeting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [memoOpen, setMemoOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState(DEFAULT_MEETING_TITLE);
  const [editingTitle, setEditingTitle] = useState(false);
  const [memo, setMemo] = useState<MeetingMemo>(() => createDefaultMeetingMemo());
  const [maskStyle, setMaskStyle] = useState<MaskStyle>("partial");
  const { autoMask, loaded: prefsLoaded } = useAccountDisplayPrefs();
  const maskSeededRef = useRef(false);
  useEffect(() => {
    if (!prefsLoaded || maskSeededRef.current) return;
    maskSeededRef.current = true;
    setMaskStyle((prev) => {
      // 사용자가 이미 다른 방식으로 바꾼 뒤에는 덮지 않는다.
      if (prev !== "partial") return prev;
      return autoMask ? "partial" : "off";
    });
  }, [prefsLoaded, autoMask]);
  const [mobileMaskOpen, setMobileMaskOpen] = useState(false);
  const [desktopMaskOpen, setDesktopMaskOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [vaultAttachOpen, setVaultAttachOpen] = useState(false);
  const mobileMaskBtnRef = useRef<HTMLButtonElement>(null);
  const desktopMaskBtnRef = useRef<HTMLButtonElement>(null);
  const toolsRootRef = useRef<HTMLDivElement>(null);
  const attachMenuRootRef = useRef<HTMLDivElement>(null);
  const isMobileComposer = useIsMobileComposer();
  const isTimelineSheet = useIsTimelineSheet();
  const keyboardInset = useKeyboardBottomInset(isMobileComposer);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);
  const inputId = useId();

  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      }).format(new Date()),
    [],
  );

  const canSend = draft.trim().length > 0;
  const elapsedLabel = formatElapsed(elapsedSec);
  const visibleMessages = useMemo(
    () => [
      ...messages,
      ...realtimeUtterances.map(
        (utterance): ChatMessage => ({
          id: `live-${utterance.itemId}`,
          side: "left",
          name: "나",
          initial: "나",
          content: utterance.text,
          corrections: utterance.corrections,
        }),
      ),
    ],
    [messages, realtimeUtterances],
  );

  useEffect(() => {
    setFocusMode(true);
    return () => setFocusMode(false);
  }, [setFocusMode]);

  useEffect(() => {
    if (!toolsOpen) return;
    function onPointer(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (target && toolsRootRef.current?.contains(target)) return;
      setToolsOpen(false);
      setAttachMenuOpen(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setToolsOpen(false);
        setAttachMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [toolsOpen]);

  useEffect(() => {
    if (!attachMenuOpen || toolsOpen) return;
    function onPointer(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null;
      if (target && attachMenuRootRef.current?.contains(target)) return;
      setAttachMenuOpen(false);
    }
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setAttachMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [attachMenuOpen, toolsOpen]);

  useEffect(() => {
    if (!editingTitle) return;
    const el = titleInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingTitle]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // justify-end + smooth 조합은 메시지 추가 시 스크롤이 튀므로
    // 레이아웃 확정 후 즉시 하단으로 고정한다.
    const frame = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [partialText, visibleMessages]);

  useEffect(() => {
    if (!inMeeting) return;
    const timer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [inMeeting]);

  useEffect(() => {
    if (!timelineOpen) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setTimelineOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    const isNarrow = window.matchMedia("(max-width: 767px)").matches;
    if (isNarrow) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (isNarrow) document.body.style.overflow = "";
    };
  }, [timelineOpen]);

  function nextId(prefix: string) {
    seqRef.current += 1;
    return `${prefix}-${seqRef.current}`;
  }

  function resizeInput() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }

  function pushFileMessage(
    speaker: (typeof SPEAKERS)[number],
    fileName: string,
    sizeLabel: string,
  ) {
    setMessages((prev) => [
      ...prev,
      {
        id: nextId("file"),
        side: speaker.side,
        name: speaker.name,
        initial: speaker.initial,
        team: "team" in speaker ? speaker.team : undefined,
        content: "",
        attachment: {
          name: fileName,
          sizeLabel,
        },
      },
    ]);
  }

  function onRealFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    handleFileSelect(event);
    if (!file) return;
    const me = SPEAKERS[0]!;
    pushFileMessage(me, file.name, formatFileSize(file.size));
    event.target.value = "";
  }

  function onVaultAttachPick(file: File, meta: VaultItemMeta) {
    const me = SPEAKERS[0]!;
    pushFileMessage(me, meta.name, formatFileSize(file.size));
    setVaultAttachOpen(false);
  }

  function onCardDrop(event: DragEvent) {
    const file = event.dataTransfer.files?.[0];
    handleDrop(event);
    if (!file) return;
    const me = SPEAKERS[0]!;
    pushFileMessage(me, file.name, formatFileSize(file.size));
  }

  function sendChat(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;

    setMessages((prev) => [
      ...prev,
      {
        id: nextId("user"),
        side: "left",
        name: "나",
        initial: "나",
        content: text,
      },
    ]);
    setDraft("");
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
        inputRef.current.focus();
      }
    });
  }

  function onInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendChat();
    }
  }

  async function stopMeeting() {
    setInMeeting(false);
    await stopRealtime();
  }

  async function handleRecordToggle() {
    if (isRecording) {
      await stopMeeting();
    } else {
      if (!REALTIME_FEATURE_ENABLED) return;
      setInMeeting(true);
      if (autoOpenTimelineOnStart) {
        setTimelineOpen(true);
      }
      const started = await startRealtime({ title: meetingTitle });
      if (!started) setInMeeting(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 bg-white">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white p-3 pb-0 sm:p-4">
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-transparent bg-card px-5 pb-0 pt-4 max-sm:rounded-b-none sm:overflow-visible sm:pb-5 xl:px-6 xl:pb-6 xl:pt-5"
          style={{
            boxShadow:
              "0 4px 12px rgba(17, 24, 39, 0.06), 0 24px 56px rgba(17, 24, 39, 0.14)",
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={onCardDrop}
        >
          {isDragging ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-2 z-40 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-primary-soft/90"
            >
              <Upload className="h-8 w-8 text-primary" strokeWidth={1.75} />
              <p className="text-base font-semibold text-primary">
                여기에 놓아 파일 첨부
              </p>
            </div>
          ) : null}
          {/* 회의 섹션 상단: 돌아가기(좌) + 제목(가운데) + 타임라인(우) */}
          <div className="mb-3 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="justify-self-start">
              <Link
                href="/dashboard"
                onClick={(event) => {
                  setInMeeting(false);
                  setMemoOpen(false);
                  setTimelineOpen(false);
                  if (isRecording) {
                    event.preventDefault();
                    void stopRealtime().finally(() => {
                      window.location.assign("/dashboard");
                    });
                  } else {
                    resetRealtime();
                  }
                }}
                className="-ml-1 inline-flex min-h-12 items-center gap-1.5 px-1 text-base font-bold text-foreground transition-opacity hover:opacity-70 md:min-h-0 md:py-1 md:text-sm"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
                기록 종료
              </Link>
            </div>
            {editingTitle ? (
              <>
                <h1 className="sr-only">{meetingTitle || DEFAULT_MEETING_TITLE}</h1>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={meetingTitle}
                  aria-label="기록 제목 수정"
                  onChange={(event) => setMeetingTitle(event.target.value)}
                  onBlur={() => {
                    const next = meetingTitle.trim() || DEFAULT_MEETING_TITLE;
                    setMeetingTitle(next);
                    setEditingTitle(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      (event.target as HTMLInputElement).blur();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setMeetingTitle((prev) => prev.trim() || DEFAULT_MEETING_TITLE);
                      setEditingTitle(false);
                    }
                  }}
                  className="min-h-12 w-full max-w-[14rem] rounded-xl bg-surface-2 px-3 py-1.5 text-center text-lg font-bold tracking-tight text-foreground outline-none ring-2 ring-primary/25 md:min-h-0"
                />
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                title="제목 수정"
                aria-label={`기록 제목 수정, 현재 ${meetingTitle}`}
                className="min-h-12 max-w-[14rem] cursor-pointer truncate rounded-xl px-2 py-1 text-center transition-colors hover:bg-surface-2 md:min-h-0"
              >
                <h1 className="truncate text-lg font-bold tracking-tight text-foreground">
                  {meetingTitle}
                </h1>
              </button>
            )}
            {/* 헤더는 돌아가기·제목만. 마스킹·타임라인은 sm+ 하단 도구 모음, max-sm은 스피드 다이얼(엄지 존)로 이동해 개수를 통일. */}
            <div className="justify-self-end" aria-hidden />
          </div>

          <div className="mb-3 flex shrink-0 justify-center">
            <ChatDateDivider label={dateLabel} />
          </div>

          {/* 회의 기록이 올라오는 섹션 */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <MeetingMemoPanel
              open={memoOpen}
              onClose={() => setMemoOpen(false)}
              memo={memo}
              onChange={setMemo}
            />
            <div ref={listRef} className="absolute inset-0 overflow-y-auto">
              <div className="flex min-h-full flex-col gap-3.5 pb-1">
                <div className="min-h-0 flex-1 shrink-0" aria-hidden />
                {visibleMessages.map((msg) => (
                  <ChatBubble
                    key={msg.id}
                    side={msg.side}
                    name={msg.name}
                    initial={msg.initial}
                    team={msg.team}
                    content={msg.content}
                    attachment={msg.attachment}
                    corrections={msg.corrections}
                    maskStyle={maskStyle}
                  />
                ))}
                {partialText ? (
                  <ChatBubble
                    side="left"
                    name="나"
                    initial="나"
                    content={partialText}
                    maskStyle={maskStyle}
                  />
                ) : null}
              </div>
            </div>
          </div>

          {realtimeError ? (
            <p
              role="alert"
              className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-base text-foreground"
            >
              {realtimeError}
            </p>
          ) : null}
          {meetingHref && !isRecording ? (
            <Link
              href={meetingHref}
              className="mt-3 inline-flex min-h-12 items-center self-end rounded-xl px-3 text-base font-semibold text-primary hover:bg-primary-soft"
            >
              기록 보기
            </Link>
          ) : null}

          {/* 하단: 입력+녹음은 맨 아래. 모바일 도구는 녹음 위 스피드 다이얼. */}
          <div
            className={cn(
              "relative z-20 mt-2 shrink-0 pt-1",
              "max-sm:-mx-5 max-sm:px-4",
              "sm:flex sm:flex-row sm:items-center sm:gap-2 sm:pb-0",
            )}
            style={
              isMobileComposer
                ? {
                    marginBottom: keyboardInset > 0 ? keyboardInset : 0,
                    paddingBottom:
                      keyboardInset > 0
                        ? 8
                        : "max(0.5rem, env(safe-area-inset-bottom, 0px))",
                  }
                : undefined
            }
          >
            <div className="flex min-w-0 items-end gap-2 sm:contents">
              <form
                onSubmit={sendChat}
                className="order-1 flex h-14 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-4 pr-1"
              >
                <label className="sr-only" htmlFor={inputId}>
                  채팅 입력
                </label>
                <textarea
                  id={inputId}
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    resizeInput();
                  }}
                  onKeyDown={onInputKeyDown}
                  onFocus={() => {
                    setToolsOpen(false);
                    setAttachMenuOpen(false);
                    setDesktopMaskOpen(false);
                  }}
                  placeholder="메시지 입력"
                  className="max-h-12 min-h-12 w-full resize-none overflow-y-auto bg-transparent py-3 text-base font-medium leading-6 text-foreground outline-none placeholder:text-foreground/55"
                />
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label="전송"
                  className={cn(
                    "inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors",
                    canSend
                      ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                      : "cursor-not-allowed bg-foreground/10 text-foreground/40",
                  )}
                >
                  <SendHorizontal className="h-5 w-5" strokeWidth={1.75} />
                </button>
              </form>

              {/* 데스크톱: 도구를 입력과 녹음 사이에 가로 배치 */}
              <div
                role="toolbar"
                aria-label="회의 도구"
                className="order-2 hidden h-14 shrink-0 items-center gap-3 sm:flex"
              >
                <div className="relative flex h-14 items-center">
                  <ToolAction
                    label="마스킹"
                    onClick={() => setDesktopMaskOpen((v) => !v)}
                    pressed={desktopMaskOpen || maskStyle !== "off"}
                    ariaLabel="개인정보 가림 방식"
                    buttonRef={desktopMaskBtnRef}
                  >
                    {maskStyle === "off" ? (
                      <Eye className="h-5 w-5" strokeWidth={1.75} />
                    ) : (
                      <EyeOff className="h-5 w-5" strokeWidth={1.75} />
                    )}
                  </ToolAction>
                  <MaskStylePopup
                    value={maskStyle}
                    onChange={(next) => {
                      setMaskStyle(next);
                      setDesktopMaskOpen(false);
                    }}
                    hideTrigger
                    open={desktopMaskOpen}
                    onOpenChange={setDesktopMaskOpen}
                    anchorRef={desktopMaskBtnRef}
                  />
                </div>
                <ToolAction
                  label="타임라인"
                  onClick={() => setTimelineOpen((v) => !v)}
                  pressed={timelineOpen}
                  ariaLabel={timelineOpen ? "타임라인 숨기기" : "타임라인 보기"}
                >
                  <History className="h-5 w-5" strokeWidth={1.75} />
                </ToolAction>
                <div ref={attachMenuRootRef} className="relative flex h-14 items-center">
                  <AttachMenuPopup
                    open={attachMenuOpen}
                    onAttach={() => {
                      setAttachMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                    onVaultAttach={() => {
                      setAttachMenuOpen(false);
                      setVaultAttachOpen(true);
                    }}
                  />
                  <ToolAction
                    label="파일 첨부"
                    onClick={() => setAttachMenuOpen((v) => !v)}
                    pressed={attachMenuOpen || vaultAttachOpen}
                    ariaLabel="파일 첨부"
                  >
                    <Paperclip className="h-5 w-5" strokeWidth={1.75} />
                  </ToolAction>
                </div>
                <ToolAction
                  label="메모"
                  onClick={() => setMemoOpen((v) => !v)}
                  pressed={memoOpen}
                  ariaLabel="메모"
                >
                  <NotebookPen className="h-5 w-5" strokeWidth={1.75} />
                </ToolAction>
              </div>

              {/* 모바일: 도구 스피드 다이얼(위) + 녹음(아래). 데스크톱: 녹음만 */}
              <div
                ref={toolsRootRef}
                className="relative order-2 flex min-w-14 shrink-0 flex-col items-center gap-2 sm:order-3 sm:h-14 sm:min-w-0 sm:justify-center"
              >
                <div className="flex w-full flex-col items-center sm:hidden">
                  {toolsOpen ? (
                    <div
                      className="absolute bottom-[calc(100%+0.5rem)] right-0 z-30 flex flex-col-reverse items-end gap-2"
                      role="menu"
                      aria-label="회의 도구"
                    >
                      <MobileFabButton
                        label="타임라인"
                        delayMs={0}
                        pressed={timelineOpen}
                        ariaLabel={
                          timelineOpen ? "타임라인 숨기기" : "타임라인 보기"
                        }
                        onClick={() => {
                          setToolsOpen(false);
                          setTimelineOpen((v) => !v);
                        }}
                      >
                        <History className="h-5 w-5" strokeWidth={1.75} />
                      </MobileFabButton>
                      <MobileFabButton
                        label="메모"
                        delayMs={40}
                        pressed={memoOpen}
                        ariaLabel="메모"
                        onClick={() => {
                          setToolsOpen(false);
                          setAttachMenuOpen(false);
                          setMemoOpen(true);
                        }}
                      >
                        <NotebookPen className="h-5 w-5" strokeWidth={1.75} />
                      </MobileFabButton>
                      <div className="relative">
                        <MaskStylePopup
                          value={maskStyle}
                          onChange={(next) => {
                            setMaskStyle(next);
                            setMobileMaskOpen(false);
                            setToolsOpen(false);
                          }}
                          hideTrigger
                          open={mobileMaskOpen}
                          onOpenChange={setMobileMaskOpen}
                          anchorRef={mobileMaskBtnRef}
                        />
                        <MobileFabButton
                          label="마스킹"
                          delayMs={80}
                          pressed={mobileMaskOpen || maskStyle !== "off"}
                          ariaLabel="개인정보 가림 방식"
                          buttonRef={mobileMaskBtnRef}
                          onClick={() => setMobileMaskOpen((v) => !v)}
                        >
                          {maskStyle === "off" ? (
                            <Eye className="h-5 w-5" strokeWidth={1.75} />
                          ) : (
                            <EyeOff className="h-5 w-5" strokeWidth={1.75} />
                          )}
                        </MobileFabButton>
                      </div>
                      <div className="relative">
                        <AttachMenuPopup
                          open={attachMenuOpen}
                          align="end"
                          onAttach={() => {
                            setAttachMenuOpen(false);
                            setToolsOpen(false);
                            fileInputRef.current?.click();
                          }}
                          onVaultAttach={() => {
                            setAttachMenuOpen(false);
                            setToolsOpen(false);
                            setVaultAttachOpen(true);
                          }}
                        />
                        <MobileFabButton
                          label="파일 첨부"
                          delayMs={120}
                          pressed={attachMenuOpen || vaultAttachOpen}
                          ariaLabel="파일 첨부"
                          onClick={() => setAttachMenuOpen((v) => !v)}
                        >
                          <Paperclip className="h-5 w-5" strokeWidth={1.75} />
                        </MobileFabButton>
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-14 w-14 cursor-pointer items-center justify-center rounded-full transition-all",
                      toolsOpen
                        ? "bg-primary text-primary-foreground shadow-soft ring-2 ring-primary/40"
                        : "bg-surface-2 text-foreground ring-1 ring-border-strong hover:bg-[#e4e6eb]",
                    )}
                    aria-label={toolsOpen ? "도구 닫기" : "도구 열기"}
                    aria-expanded={toolsOpen}
                    aria-haspopup="menu"
                    onClick={() => {
                      setMobileMaskOpen(false);
                      setAttachMenuOpen(false);
                      setToolsOpen((open) => !open);
                    }}
                  >
                    {toolsOpen ? (
                      <X className="h-5 w-5" strokeWidth={2} />
                    ) : (
                      <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleRecordToggle}
                  disabled={!isRecording && !REALTIME_FEATURE_ENABLED}
                  aria-pressed={isRecording}
                  aria-label={isRecording ? "녹음 중지" : "녹음 시작"}
                  title={
                    !isRecording && !REALTIME_FEATURE_ENABLED
                      ? "실시간 기록은 오픈 준비중이에요. 업로드 분석을 이용해 주세요."
                      : isRecording
                        ? "인식 중지"
                        : "인식 시작"
                  }
                  className={cn(
                    "group relative flex h-14 shrink-0 items-center justify-center transition-all active:scale-95",
                    isRecording
                      ? "min-w-[8.5rem] cursor-pointer gap-1.5 rounded-full bg-masked px-3 text-white shadow-soft ring-2 ring-masked/40"
                      : REALTIME_FEATURE_ENABLED
                        ? "w-14 cursor-pointer rounded-full bg-surface-2 ring-1 ring-border-strong hover:bg-[#e4e6eb]"
                        : "w-14 cursor-not-allowed rounded-full bg-surface-2 opacity-40 ring-1 ring-border-strong",
                  )}
                >
                  {isRecording ? (
                    <>
                      <RecordBeatBars />
                      <span className="text-[12px] font-bold tracking-tight">
                        회의 녹음중
                      </span>
                      <span className="font-mono text-[12px] font-bold tabular-nums tracking-tight">
                        {elapsedLabel}
                      </span>
                    </>
                  ) : (
                    <span
                      className="h-10 w-10 rounded-full bg-masked shadow-soft"
                      aria-hidden
                    />
                  )}
                </button>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={acceptedFormats.join(",")}
              onChange={onRealFileSelected}
              className="sr-only"
              aria-hidden
            />
          </div>
        </div>
      </div>

      <VaultPickerDialog
        open={vaultAttachOpen}
        onClose={() => setVaultAttachOpen(false)}
        onPick={onVaultAttachPick}
      />

      {isTimelineSheet ? (
        timelineOpen ? (
          <ScenarioPanel
            layout="sheet"
            elapsedLabel={elapsedLabel}
            running={inMeeting}
            utterances={realtimeUtterances}
            partialText={partialText}
            maskStyle={maskStyle}
            onClose={() => setTimelineOpen(false)}
          />
        ) : null
      ) : (
        <aside
          className={cn(
            "flex shrink-0 flex-col overflow-hidden border-l border-border bg-card",
            "h-full transition-[width] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
            timelineOpen ? "w-96" : "w-0 border-l-0",
          )}
          aria-hidden={!timelineOpen}
        >
          <div className="flex h-full w-96 min-w-[24rem] flex-col">
            <ScenarioPanel
              layout="rail"
              elapsedLabel={elapsedLabel}
              running={inMeeting}
              utterances={realtimeUtterances}
              partialText={partialText}
              maskStyle={maskStyle}
              onClose={() => setTimelineOpen(false)}
            />
          </div>
        </aside>
      )}
    </div>
  );
}
