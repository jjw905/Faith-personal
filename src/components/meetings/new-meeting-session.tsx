"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Clock3,
  FileAudio,
  History,
  NotebookPen,
  Paperclip,
  Plus,
  RefreshCw,
  SendHorizontal,
  Shuffle,
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
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { MaskedText } from "@/components/meetings/masked-text";
import { MaskStylePopup } from "@/components/meetings/mask-style-picker";
import { useAppContext } from "@/context/app-context";
import { useMeetingChrome } from "@/context/meeting-chrome-context";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useRecording } from "@/hooks/use-recording";
import { maskPii, type MaskStyle } from "@/lib/masking";
import { cn } from "@/lib/utils";

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
};

type ScenarioBeat = {
  time: string;
  kind: string;
  title: string;
  line: string;
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

const CONTENT_POOL = [
  "오늘 안건부터 정리할까요?",
  "지난주 마스킹 오탐 리뷰 공유드릴게요.",
  "연락처는 010-3942-3916 로 남겨 주세요.",
  "샘플은 seoyeon.lee@partner.co.kr 로 보내 두었습니다.",
  "권한 매트릭스는 아직 초안 단계입니다.",
  "데모 계정은 어제 준비 끝났어요.",
  "민감정보는 자동 마스킹되는지 같이 보죠.",
  "회의록 타임라인 요약이 잘 붙는지 확인합시다.",
  "참석자 발화 구분도 테스트에 넣어 주세요.",
  "다음 액션은 월요일까지로 잡겠습니다.",
  "외부 공유 전 검수 체크리스트 한번 볼게요.",
  "결정 사항은 사용자 관리 메뉴에 반영합시다.",
  "소요 시간은 대략 40분 정도로 보면 됩니다.",
  "시나리오 칸에 요약 대사가 뜨는지 봐 주세요.",
  "파일 업로드 클립도 이어서 검증하겠습니다.",
  "레이아웃 비율이 깨지지 않는지 확인 중이에요.",
  "인식 시작 후에는 좌측 메뉴가 사라져야 합니다.",
  "우측 시나리오에 타임라인 구간을 채워 둘게요.",
  "버블이 너무 빽빽하면 간격만 조금 조정하죠.",
  "개발용 랜덤 메시지 스트림은 약 1분 분량입니다.",
  "질문 있으시면 채팅으로 바로 남겨 주세요.",
  "다음 안건은 접근 로그 이상 징후입니다.",
  "감사 대응 체크리스트도 같이 점검합시다.",
  "좋습니다. 이어서 진행하겠습니다.",
  "요약문 톤은 지금이 무난해 보입니다.",
  "마지막에 후속 조치만 정리하면 충분합니다.",
];

const SCENARIO_SEED: ScenarioBeat[] = [
  {
    time: "00:00",
    kind: "안건",
    title: "킥오프",
    line: "회의 목적과 마스킹·타임라인 검증 범위를 공유합니다.",
  },
  {
    time: "00:12",
    kind: "논의",
    title: "레이아웃",
    line: "채팅 버블과 홈 ChatMock 정렬이 같은지 확인합니다.",
  },
  {
    time: "00:28",
    kind: "논의",
    title: "인식 흐름",
    line: "녹음 시작 시 좌측 메뉴 숨김, 우측 시나리오 노출을 점검합니다.",
  },
  {
    time: "00:44",
    kind: "결정",
    title: "업로드",
    line: "클립 아이콘으로 오디오 파일을 정식 첨부할 수 있게 합니다.",
  },
  {
    time: "00:58",
    kind: "조치",
    title: "후속",
    line: "1분 랜덤 메시지 스트림과 타임라인 요약을 함께 검증합니다.",
  },
];

const SAMPLE_AUDIO_FILES = [
  {
    name: "meeting-intro-noise30.wav",
    path: "/samples/audio/meeting-intro-noise30.wav",
    sizeLabel: "약 480 KB",
  },
  {
    name: "meeting-action-noise30.wav",
    path: "/samples/audio/meeting-action-noise30.wav",
    sizeLabel: "약 510 KB",
  },
  {
    name: "meeting-cafe-noise30.wav",
    path: "/samples/audio/meeting-cafe-noise30.wav",
    sizeLabel: "약 520 KB",
  },
  {
    name: "meeting-pii-noise30.wav",
    path: "/samples/audio/meeting-pii-noise30.wav",
    sizeLabel: "약 495 KB",
  },
  {
    name: "meeting-summary-noise30.wav",
    path: "/samples/audio/meeting-summary-noise30.wav",
    sizeLabel: "약 505 KB",
  },
  {
    name: "meeting-new-session.wav",
    path: "/samples/audio/meeting-new-session.wav",
    sizeLabel: "약 620 KB",
  },
] as const;

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function createRandomMessage(): Omit<ChatMessage, "id"> {
  const speaker = pickRandom(SPEAKERS);
  return {
    ...speaker,
    content: pickRandom(CONTENT_POOL),
  };
}

function formatElapsed(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
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
          <span className="mt-0.5 text-[8px] font-bold leading-none tracking-wide opacity-80">
            {ext}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-snug">{name}</p>
          <p
            className={cn(
              "mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-medium",
              isMe ? "text-primary-foreground/75" : "text-muted",
            )}
          >
            <span>오디오</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{sizeLabel}</span>
            {isTest ? (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-bold leading-none",
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

function ChatBubble({
  side,
  name,
  initial,
  team,
  content,
  attachment,
  maskStyle,
}: {
  side: Side;
  name: string;
  initial: string;
  team?: string;
  content: string;
  attachment?: ChatMessage["attachment"];
  maskStyle: MaskStyle;
}) {
  const isMe = side === "left";
  const matches = content
    ? maskPii(content, { style: maskStyle }).matches
    : [];

  return (
    <div
      className={cn(
        "flex w-full min-w-0 animate-[bubble-in_320ms_ease-out]",
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
            "mb-1 flex min-w-0 items-baseline gap-1.5 text-[11px] font-semibold",
            isMe ? "flex-row-reverse text-primary" : "text-foreground",
          )}
        >
          <span className="truncate">{name}</span>
          {!isMe && team ? (
            <span className="shrink-0 rounded bg-surface-2 px-1.5 py-px text-[10px] font-medium text-muted">
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

const DEFAULT_MEETING_TITLE = "새 회의";

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
      "파일 첨부·메모 보기 동선이 방해되지 않는지 확인",
    ].map(createMemoLine),
    notes: [
      "민감정보가 나오면 마스킹 칩으로 가려진 뒤 클릭 시에만 원문 확인",
      "시나리오 타임라인은 경과 시간에 맞춰 구간이 순차 개방됨",
      "개발 전용 랜덤 메시지 스트림은 약 1분 분량으로 레이아웃 부하를 점검",
    ].map(createMemoLine),
    decisions: [
      "채팅 입력과 녹음 버튼은 같은 행에 배치",
      "개발 도구·파일·메모는 아래 행에 좌우로 분리",
    ].map(createMemoLine),
    followUps: [
      "실제 STT 연동 전, 시나리오 요약 문장 톤을 한 번 더 다듬기",
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
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold tracking-wide text-muted">
          {label}
        </h3>
        <button
          type="button"
          onClick={addItem}
          aria-label={`${label} 추가`}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-primary transition-colors hover:bg-primary-soft"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
          {addLabel}
        </button>
      </div>
      <ul className="space-y-1.5">
        {items.length === 0 ? (
          <li className="rounded-xl bg-surface px-3 py-2 text-[11px] text-muted">
            항목이 없습니다. 추가로 입력하세요.
          </li>
        ) : (
          items.map((item) => (
            <li key={item.id} className="flex items-start gap-1.5">
              <input
                type="text"
                data-memo-line-id={item.id}
                value={item.text}
                onChange={(event) => updateItem(item.id, event.target.value)}
                placeholder={placeholder}
                className="min-w-0 flex-1 rounded-xl bg-surface px-3 py-2 text-xs leading-relaxed text-foreground outline-none ring-1 ring-transparent transition-[box-shadow,background-color] placeholder:text-muted focus:bg-card focus:ring-primary/25"
              />
              <button
                type="button"
                onClick={() => removeItem(item.id)}
                aria-label={`${label} 항목 삭제`}
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-masked"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

function DevBadge() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -left-0.5 -top-0.5 z-10 rounded-[4px] bg-primary px-1 py-px text-[8px] font-bold leading-none tracking-tight text-primary-foreground"
    >
      개발
    </span>
  );
}

function ToolAction({
  label,
  onClick,
  pressed,
  ariaLabel,
  badge,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  ariaLabel: string;
  badge?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="relative flex w-10 flex-col items-center">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        aria-label={ariaLabel}
        title={label}
        className={cn(
          "relative inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all",
          pressed
            ? "bg-primary text-primary-foreground shadow-soft ring-2 ring-primary/40"
            : "bg-surface-2 text-foreground/70 ring-1 ring-border-strong hover:bg-[#e4e6eb] hover:text-foreground",
        )}
      >
        {badge ? <DevBadge /> : null}
        {children}
      </button>
      <span
        className={cn(
          "pointer-events-none absolute left-1/2 top-[calc(100%+4px)] w-max max-w-[4.5rem] -translate-x-1/2 text-center text-[10px] font-semibold leading-tight",
          pressed ? "text-primary" : "text-foreground/65",
        )}
      >
        {label}
      </span>
    </div>
  );
}

function RecordBeatBars() {
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

function AttachMenuPopup({
  open,
  onAttach,
  onRandomSend,
}: {
  open: boolean;
  onAttach: () => void;
  onRandomSend: () => void;
}) {
  if (!open) return null;

  return (
    <div
      role="menu"
      aria-label="파일 첨부 메뉴"
      className="absolute bottom-full left-1/2 z-50 mb-2 w-52 -translate-x-1/2 rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border"
      style={{
        animation: "fab-item-up 220ms cubic-bezier(0.2, 0, 0, 1) both",
      }}
    >
      <button
        type="button"
        role="menuitem"
        onClick={onAttach}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-[13px] font-semibold text-foreground transition-colors hover:bg-surface-2"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground">
          <Upload className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1 truncate">파일 첨부</span>
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onRandomSend}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-[13px] font-semibold text-foreground transition-colors hover:bg-surface-2"
      >
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground">
          <Shuffle className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1 truncate">파일 임의전송</span>
        <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold leading-none text-primary-foreground">
          개발
        </span>
      </button>
    </div>
  );
}

function ResetConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
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

function ScenarioPanel({
  beats,
  elapsedSec,
  elapsedLabel,
  running,
  onClose,
}: {
  beats: ScenarioBeat[];
  elapsedSec: number;
  elapsedLabel: string;
  running: boolean;
  onClose: () => void;
}) {
  const unlockStep = 8;
  const unlockedCount =
    elapsedSec === 0 && !running
      ? 0
      : Math.min(beats.length, Math.floor(elapsedSec / unlockStep) + 1);
  const visibleBeats = beats.slice(0, unlockedCount);
  const activeIndex = Math.max(0, visibleBeats.length - 1);

  return (
    <aside
      aria-label="시나리오 타임라인"
      className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-card"
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">타임라인</h2>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            위에서 아래로 순차 생성
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-muted">
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
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <ol className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {visibleBeats.length === 0 ? (
          <li className="rounded-xl bg-surface px-3 py-3 text-xs leading-relaxed text-muted">
            인식을 시작하면 시간순으로 타임라인이 생성됩니다.
          </li>
        ) : (
          visibleBeats.map((beat, index) => {
            const active = index === activeIndex;
            const isLast = index === visibleBeats.length - 1;
            return (
              <li
                key={`${beat.time}-${beat.title}`}
                className="relative flex gap-2.5 animate-[bubble-in_280ms_ease-out]"
              >
                <div className="relative flex w-7 shrink-0 flex-col items-center">
                  {!isLast ? (
                    <span
                      aria-hidden
                      className="absolute bottom-0 left-1/2 top-7 w-0.5 -translate-x-1/2 bg-primary/35"
                    />
                  ) : null}
                  <span
                    className={cn(
                      "relative z-10 flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-foreground",
                      active && "bg-primary-soft text-primary",
                    )}
                  >
                    <Clock3
                      className={cn("h-3.5 w-3.5", active && "animate-spin")}
                      strokeWidth={1.75}
                    />
                  </span>
                </div>
                <div
                  className={cn(
                    "min-w-0 flex-1 rounded-xl bg-surface px-2.5 py-2",
                    !isLast && "mb-3",
                  )}
                >
                  <div className="mb-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <span className="font-mono text-[10px] tabular-nums text-muted">
                      {beat.time}
                    </span>
                    <span className="text-[11px] font-semibold text-foreground">
                      {beat.title}
                    </span>
                    <span className="text-[9px] font-medium text-muted">
                      {beat.kind}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-foreground/80">
                    {beat.line}
                  </p>
                </div>
              </li>
            );
          })
        )}
      </ol>
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
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function patch(partial: Partial<MeetingMemo>) {
    onChange({ ...memo, ...partial });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="회의 메모"
      className="absolute inset-y-0 right-0 z-30 flex w-full max-w-[22rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft sm:w-[22rem]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <input
            type="text"
            value={memo.title}
            onChange={(event) => patch({ title: event.target.value })}
            aria-label="메모 제목"
            className="w-full bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-muted"
            placeholder="회의 메모"
          />
          <input
            type="text"
            value={memo.subject}
            onChange={(event) => patch({ subject: event.target.value })}
            aria-label="메모 주제"
            className="mt-1 w-full bg-transparent text-xs text-muted outline-none placeholder:text-muted/70"
            placeholder="주제"
          />
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="메모 닫기"
          className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
        >
          <X className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
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
        <section className="rounded-2xl bg-warning-soft px-3 py-2.5">
          <h3 className="text-[11px] font-semibold tracking-wide text-warning">
            주의
          </h3>
          <textarea
            value={memo.caution}
            onChange={(event) => patch({ caution: event.target.value })}
            rows={3}
            className="mt-1 w-full resize-y rounded-xl bg-transparent px-0 py-1 text-xs leading-relaxed text-foreground/90 outline-none"
            placeholder="주의 사항"
          />
        </section>
      </div>
    </div>
  );
}

/** 홈 ChatMock 레이아웃을 따른 새 회의 실시간 세션. */
export function NewMeetingSession() {
  const { setFocusMode } = useMeetingChrome();
  const { autoOpenTimelineOnStart } = useAppContext();
  const { isRecording, toggleRecording, resetRecording } = useRecording();
  const {
    selectedFile,
    acceptedFormats,
    handleFileSelect,
    clearFile,
  } = useFileUpload();

  const [inMeeting, setInMeeting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [memoOpen, setMemoOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState(DEFAULT_MEETING_TITLE);
  const [editingTitle, setEditingTitle] = useState(false);
  const [memo, setMemo] = useState<MeetingMemo>(() => createDefaultMeetingMemo());
  const [maskStyle, setMaskStyle] = useState<MaskStyle>("partial");

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const seqRef = useRef(0);
  const streamTimerRef = useRef<number | null>(null);
  const streamEndRef = useRef(0);
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

  useEffect(() => {
    setFocusMode(true);
    return () => setFocusMode(false);
  }, [setFocusMode]);

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
  }, [messages]);

  useEffect(() => {
    if (!inMeeting) return;
    const timer = window.setInterval(() => {
      setElapsedSec((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [inMeeting]);

  useEffect(() => {
    return () => {
      if (streamTimerRef.current) window.clearTimeout(streamTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!attachMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (attachMenuRef.current && !attachMenuRef.current.contains(target)) {
        setAttachMenuOpen(false);
      }
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setAttachMenuOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [attachMenuOpen]);

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

  function pushRandomMessage() {
    const line = createRandomMessage();
    setMessages((prev) => [...prev, { ...line, id: nextId("rnd") }]);
  }

  function pushFileMessage(
    speaker: (typeof SPEAKERS)[number],
    fileName: string,
    sizeLabel: string,
    options?: { isTest?: boolean },
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
          isTest: options?.isTest,
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
    setAttachMenuOpen(false);
    event.target.value = "";
  }

  function sendRandomTestFiles() {
    setAttachMenuOpen(false);
    const me = SPEAKERS[0]!;
    const partner = pickRandom(SPEAKERS.filter((s) => s.side === "right"));
    const mine = pickRandom([...SAMPLE_AUDIO_FILES]);
    const theirs = pickRandom([...SAMPLE_AUDIO_FILES]);

    pushFileMessage(me, mine.name, mine.sizeLabel, { isTest: true });
    window.setTimeout(() => {
      pushFileMessage(partner, theirs.name, theirs.sizeLabel, { isTest: true });
    }, 320);
  }

  function clearStreamTimer() {
    if (streamTimerRef.current) {
      window.clearTimeout(streamTimerRef.current);
      streamTimerRef.current = null;
    }
  }

  function scheduleNextRandomMessage() {
    const remaining = streamEndRef.current - Date.now();
    if (remaining <= 0) {
      setStreaming(false);
      streamTimerRef.current = null;
      return;
    }

    const delay = 1800 + Math.floor(Math.random() * 2200);
    streamTimerRef.current = window.setTimeout(() => {
      pushRandomMessage();
      scheduleNextRandomMessage();
    }, Math.min(delay, remaining));
  }

  function toggleRandomStream() {
    if (streaming) {
      clearStreamTimer();
      setStreaming(false);
      if (!isRecording) {
        setInMeeting(false);
      }
      return;
    }

    setInMeeting(true);
    if (autoOpenTimelineOnStart) {
      setTimelineOpen(true);
    }
    setStreaming(true);
    streamEndRef.current = Date.now() + 60_000;
    pushRandomMessage();
    scheduleNextRandomMessage();
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

  function handleRecordToggle() {
    if (isRecording) {
      setInMeeting(false);
    } else {
      setInMeeting(true);
      if (autoOpenTimelineOnStart) {
        setTimelineOpen(true);
      }
    }
    toggleRecording();
  }

  function requestReset() {
    setAttachMenuOpen(false);
    setResetConfirmOpen(true);
  }

  function handleReset() {
    clearStreamTimer();
    setStreaming(false);
    setInMeeting(false);
    setMemoOpen(false);
    setAttachMenuOpen(false);
    setResetConfirmOpen(false);
    resetRecording();
    setMessages([]);
    setDraft("");
    setElapsedSec(0);
    setMeetingTitle(DEFAULT_MEETING_TITLE);
    setEditingTitle(false);
    setMemo(createDefaultMeetingMemo());
    clearFile();
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
        inputRef.current.focus();
      }
    });
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-4">
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-visible rounded-3xl border border-transparent bg-card px-5 pb-5 pt-4 xl:px-6 xl:pb-6 xl:pt-5"
          style={{
            boxShadow:
              "0 4px 12px rgba(17, 24, 39, 0.06), 0 24px 56px rgba(17, 24, 39, 0.14)",
          }}
        >
          {/* 회의 섹션 상단: 돌아가기(좌) + 제목(가운데) + 타임라인(우) */}
          <div className="mb-3 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="justify-self-start">
              <Link
                href="/dashboard"
                onClick={() => {
                  clearStreamTimer();
                  setStreaming(false);
                  setInMeeting(false);
                  setMemoOpen(false);
                  setAttachMenuOpen(false);
                  setTimelineOpen(false);
                  resetRecording();
                }}
                className="-ml-1 inline-flex items-center gap-1.5 px-1 py-1 text-sm font-bold text-foreground transition-opacity hover:opacity-70"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
                회의종료
              </Link>
            </div>
            {editingTitle ? (
              <>
                <h1 className="sr-only">{meetingTitle || DEFAULT_MEETING_TITLE}</h1>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={meetingTitle}
                  aria-label="회의 제목 수정"
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
                  className="w-full max-w-[14rem] rounded-xl bg-surface-2 px-3 py-1.5 text-center text-lg font-bold tracking-tight text-foreground outline-none ring-2 ring-primary/25"
                />
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditingTitle(true)}
                title="제목 수정"
                aria-label={`회의 제목 수정, 현재 ${meetingTitle}`}
                className="max-w-[14rem] cursor-pointer truncate rounded-xl px-2 py-1 text-center transition-colors hover:bg-surface-2"
              >
                <h1 className="truncate text-lg font-bold tracking-tight text-foreground">
                  {meetingTitle}
                </h1>
              </button>
            )}
            <div className="flex items-center justify-self-end gap-1.5">
              <MaskStylePopup value={maskStyle} onChange={setMaskStyle} />
              <button
                type="button"
                onClick={() => setTimelineOpen((v) => !v)}
                aria-pressed={timelineOpen}
                aria-label={timelineOpen ? "타임라인 숨기기" : "타임라인 보기"}
                className={cn(
                  "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-all sm:h-10 sm:w-10",
                  timelineOpen
                    ? "bg-primary text-primary-foreground shadow-soft ring-2 ring-primary/40"
                    : "bg-surface-2 text-foreground/70 ring-1 ring-border-strong hover:bg-[#e4e6eb] hover:text-foreground",
                )}
              >
                <History className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.75} />
              </button>
            </div>
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
                {messages.map((msg) => (
                  <ChatBubble
                    key={msg.id}
                    side={msg.side}
                    name={msg.name}
                    initial={msg.initial}
                    team={msg.team}
                    content={msg.content}
                    attachment={msg.attachment}
                    maskStyle={maskStyle}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* 메시지 입력 섹션: 모바일은 2행(입력+녹음 / 도구), sm+는 입력·도구·녹음 1행 */}
          <div className="relative z-20 mt-3 flex shrink-0 flex-col gap-2 overflow-visible border-t border-border pb-4 pt-3 sm:flex-row sm:items-center sm:gap-2">
            <div className="flex min-w-0 items-center gap-2 sm:contents">
              <form
                onSubmit={sendChat}
                className="order-1 flex h-14 min-w-0 flex-1 items-center gap-2 rounded-2xl bg-surface-2 px-3"
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
                  placeholder="메시지 입력"
                  className="max-h-10 min-h-10 w-full resize-none overflow-y-auto bg-transparent py-2 text-[15px] font-medium leading-5 text-foreground outline-none placeholder:text-foreground/55"
                />
                <button
                  type="submit"
                  disabled={!canSend}
                  aria-label="전송"
                  className={cn(
                    "inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors",
                    canSend
                      ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                      : "cursor-not-allowed bg-foreground/10 text-foreground/40",
                  )}
                >
                  <SendHorizontal className="h-4 w-4" strokeWidth={1.75} />
                </button>
              </form>

              <button
                type="button"
                onClick={handleRecordToggle}
                aria-pressed={isRecording}
                aria-label={isRecording ? "녹음 중지" : "녹음 시작"}
                title={isRecording ? "인식 중지" : "인식 시작"}
                className={cn(
                  "group relative order-2 flex h-14 shrink-0 cursor-pointer items-center justify-center transition-all active:scale-95 sm:order-3",
                  isRecording
                    ? "min-w-[5.75rem] gap-1.5 rounded-full bg-masked px-3 text-white shadow-soft ring-2 ring-masked/40"
                    : "w-14 rounded-full bg-surface-2 ring-1 ring-border-strong hover:bg-[#e4e6eb]",
                )}
              >
                {isRecording ? (
                  <>
                    <RecordBeatBars />
                    <span className="font-mono text-[12px] font-bold tabular-nums tracking-tight">
                      {elapsedLabel}
                    </span>
                  </>
                ) : (
                  <span
                    className="h-10 w-10 rounded-full bg-masked shadow-soft transition-transform group-hover:scale-[1.03]"
                    aria-hidden
                  />
                )}
              </button>
            </div>

            <div
              role="toolbar"
              aria-label="회의 도구"
              className="order-3 flex h-14 w-full shrink-0 items-center justify-between gap-2 px-1 sm:order-2 sm:w-auto sm:justify-start sm:gap-[0.9375rem]"
            >
              <ToolAction
                label={streaming ? "스트림 중지" : "랜덤 메시지"}
                onClick={toggleRandomStream}
                pressed={streaming}
                ariaLabel={streaming ? "랜덤 메시지 중지" : "랜덤 메시지 시작"}
                badge
              >
                <Clock3
                  className={cn("h-4 w-4", streaming && "animate-spin")}
                  strokeWidth={1.75}
                />
              </ToolAction>
              <ToolAction
                label="초기화"
                onClick={requestReset}
                ariaLabel="세션 초기화"
                badge
              >
                <RefreshCw className="h-4 w-4" strokeWidth={1.75} />
              </ToolAction>
              <div ref={attachMenuRef} className="relative flex w-10 flex-col items-center">
                <AttachMenuPopup
                  open={attachMenuOpen}
                  onAttach={() => {
                    setAttachMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  onRandomSend={sendRandomTestFiles}
                />
                <button
                  type="button"
                  onClick={() => setAttachMenuOpen((v) => !v)}
                  aria-expanded={attachMenuOpen}
                  aria-haspopup="menu"
                  aria-pressed={attachMenuOpen}
                  aria-label="파일 첨부"
                  title="파일 첨부"
                  className={cn(
                    "relative inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all",
                    attachMenuOpen
                      ? "bg-primary text-primary-foreground shadow-soft ring-2 ring-primary/40"
                      : "bg-surface-2 text-foreground/70 ring-1 ring-border-strong hover:bg-[#e4e6eb] hover:text-foreground",
                  )}
                >
                  <Paperclip className="h-4 w-4" strokeWidth={1.75} />
                </button>
                <span
                  className={cn(
                    "pointer-events-none absolute left-1/2 top-[calc(100%+4px)] w-max max-w-[4.5rem] -translate-x-1/2 text-center text-[10px] font-semibold leading-tight",
                    attachMenuOpen ? "text-primary" : "text-foreground/65",
                  )}
                >
                  파일 첨부
                </span>
              </div>
              <ToolAction
                label="메모 보기"
                onClick={() => setMemoOpen((v) => !v)}
                pressed={memoOpen}
                ariaLabel="메모 보기"
              >
                <NotebookPen className="h-4 w-4" strokeWidth={1.75} />
              </ToolAction>
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

      <ResetConfirmDialog
        open={resetConfirmOpen}
        onCancel={() => setResetConfirmOpen(false)}
        onConfirm={handleReset}
      />

      {/* 모바일: 오버레이, md+: 우측 사이드바 슬라이드 인 */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden",
          timelineOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setTimelineOpen(false)}
        aria-hidden
      />
      <aside
        className={cn(
          "flex shrink-0 flex-col overflow-hidden border-l border-border bg-card",
          "fixed inset-y-0 right-0 z-50 w-[min(24rem,100%)] transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
          "md:static md:z-auto md:h-full md:transition-[width]",
          timelineOpen
            ? "translate-x-0 md:w-96"
            : "translate-x-full md:w-0 md:translate-x-0 md:border-l-0",
        )}
        aria-hidden={!timelineOpen}
      >
        <div className="flex h-full w-full min-w-0 flex-col md:w-96 md:min-w-[24rem]">
          <ScenarioPanel
            beats={SCENARIO_SEED}
            elapsedSec={elapsedSec}
            elapsedLabel={elapsedLabel}
            running={inMeeting}
            onClose={() => setTimelineOpen(false)}
          />
        </div>
      </aside>
    </div>
  );
}
