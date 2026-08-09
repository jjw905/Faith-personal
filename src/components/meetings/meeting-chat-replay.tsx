"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

import { TranscriptAttachmentCard } from "@/components/meetings/meeting-attachments";
import {
  MeetingChatReplayBar,
  readChatReplaySettings,
  writeChatReplaySettings,
  type ChatReplaySettings,
} from "@/components/meetings/meeting-chat-replay-bar";
import { ChatReplayHeaderBar } from "@/components/meetings/chat-replay-header-bar";
import { ChatReplayTools } from "@/components/meetings/chat-replay-tools";
import { CorrectionHint } from "@/components/meetings/correction-hint";
import { MaskedText } from "@/components/meetings/masked-text";
import { MeetingTitleHeading } from "@/components/meetings/meeting-record-actions";
import { MeetingRecordBackLink } from "@/components/meetings/meeting-record-layout";
import { Button } from "@/components/ui/button";
import { MaterialSymbol } from "@/components/ui/material-symbol";
import { useAppContext } from "@/context/app-context";
import { useAccountDisplayPrefs } from "@/hooks/use-account-display-prefs";
import {
  bubbleEditLockStyle,
  canStartBubbleTextEdit,
  lockBubbleEditSize,
  type BubbleEditLockSize,
} from "@/lib/chat-bubble-edit";
import { maskPii, type MaskStyle } from "@/lib/masking";
import { activeLineIndexAt, activeWordFocusAt, lineStartSec, estimateTranscriptDurationSec, parseDurationLabelToSec, readMediaDurationSec } from "@/lib/transcript-time";
import type { Meeting, Participant } from "@/types/meeting";
import type {
  MeetingTranscript,
  TranscriptCorrection,
  TranscriptLine,
} from "@/types/transcript";
import { cn } from "@/lib/utils";

/** 메모/보정 반영은 실 업로드 회의(사용자 저장소)에만 서버 반영된다.
 * 목업 미리보기 등은 로컬 화면 상태만 바뀌고 저장은 조용히 건너뛴다. */
async function patchMeeting(
  meetingId: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return Boolean(data.ok);
  } catch {
    // 오프라인 등으로 저장 실패해도 화면 상태는 유지한다.
    return false;
  }
}

function resolveMeName(participants: Participant[], currentName: string) {
  if (participants.some((p) => p.name === currentName)) return currentName;
  const host = participants.find((p) => p.isHost);
  if (host) return host.name;
  const member = participants.find((p) => p.isMember);
  if (member) return member.name;
  return currentName;
}

function isMyLine(speaker: string, meName: string) {
  if (speaker === "발화" || speaker.startsWith("화자")) return false;
  return speaker === meName || speaker === "나" || speaker === "진행자";
}

function personMeta(
  speaker: string,
  participants: Participant[],
  meName: string,
): { initial: string; color: string; mine: boolean; label: string } {
  const mine = isMyLine(speaker, meName);
  const found = participants.find((p) => p.name === speaker);

  if (mine) {
    return {
      initial: found?.initials ?? (meName.slice(0, 1) || "나"),
      color: found?.color ?? "bg-primary",
      mine: true,
      label: "나",
    };
  }

  if (found) {
    return {
      initial: found.initials,
      color: found.color,
      mine: false,
      label: found.name,
    };
  }

  return {
    initial: speaker.slice(0, 1),
    color: "bg-slate-500",
    mine: false,
    label: speaker,
  };
}

function ReplayBubble({
  line,
  participants,
  meName,
  maskStyle,
  active,
  currentSec,
  wordFocus = true,
  playing = false,
  canEditText = false,
  onSeek,
  onLineTextChange,
  onMemoChange,
  onApplyCorrection,
}: {
  line: TranscriptLine;
  participants: Participant[];
  meName: string;
  maskStyle: MaskStyle;
  active: boolean;
  /** 이 말풍선이 active일 때만 의미 있는 재생 시각(초). 단어 하이라이트용. */
  currentSec: number;
  wordFocus?: boolean;
  playing?: boolean;
  canEditText?: boolean;
  onSeek?: (line: TranscriptLine, atSec?: number) => void;
  onLineTextChange?: (lineId: string, next: string) => void;
  onMemoChange: (lineId: string, next: string) => void;
  onApplyCorrection: (
    lineId: string,
    correction: TranscriptCorrection,
  ) => void;
}) {
  const meta = personMeta(line.speaker, participants, meName);
  const text = line.text ?? "";
  const matches = text ? maskPii(text, { style: maskStyle }).matches : [];
  const corrections = line.corrections ?? [];
  const activeWordFocus =
    active && wordFocus ? activeWordFocusAt(line.words, currentSec) : null;
  const activeWordRange = activeWordFocus
    ? {
        startOffset: activeWordFocus.word.startOffset,
        endOffset: activeWordFocus.word.endOffset,
      }
    : null;
  const memo = line.memo;
  const [editingMemo, setEditingMemo] = useState(false);
  const [memoDraft, setMemoDraft] = useState(memo ?? "");
  const [editingText, setEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState(text);
  const [textBusy, setTextBusy] = useState(false);
  /** 편집 시작 시 말풍선 픽셀 크기 고정 — 클릭만으로 늘어나지 않게 */
  const [editSize, setEditSize] = useState<BubbleEditLockSize | null>(null);
  const hasMemo = Boolean(memo?.trim());
  const memoRef = useRef<HTMLTextAreaElement>(null);
  const bubbleShellRef = useRef<HTMLDivElement>(null);
  const textEditRef = useRef<HTMLTextAreaElement>(null);
  const skipTextCommitRef = useRef(false);
  const canStartTextEdit = canStartBubbleTextEdit({
    canEditText,
    hasText: Boolean(text),
    playing,
    editingMemo,
  });

  useEffect(() => {
    if (!editingMemo) setMemoDraft(memo ?? "");
  }, [memo, editingMemo]);

  useEffect(() => {
    if (!editingText) setTextDraft(text);
  }, [text, editingText]);

  useEffect(() => {
    if (playing && editingText) {
      setEditSize(null);
      setEditingText(false);
    }
  }, [playing, editingText]);

  useEffect(() => {
    if (!editingMemo) return;
    const el = memoRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [editingMemo]);

  // contentEditable+children null 은 리렌더 때 본문이 지워짐 → textarea 로 고정
  useLayoutEffect(() => {
    if (!editingText) return;
    const el = textEditRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [editingText]);

  // 단어 포커스마다 mark.scrollIntoView 하면 스크롤포트가 미세하게 흔들린다.
  // 줄 단위 따라가기(MeetingChatReplay activeId effect)만 유지한다.

  function commitMemo() {
    onMemoChange(line.id, memoDraft.trim());
    setEditingMemo(false);
  }

  function stopTextEdit() {
    setEditSize(null);
    setEditingText(false);
  }

  function beginTextEdit() {
    const el = bubbleShellRef.current;
    if (el) {
      setEditSize(lockBubbleEditSize(el.getBoundingClientRect()));
    }
    setTextDraft(text);
    setEditingText(true);
  }

  async function commitText(raw?: string) {
    if (!onLineTextChange || textBusy) return;
    const next = (raw ?? textDraft).trim();
    if (!next) {
      setTextDraft(text);
      stopTextEdit();
      return;
    }
    if (next === text) {
      stopTextEdit();
      return;
    }
    setTextBusy(true);
    try {
      await onLineTextChange(line.id, next);
      stopTextEdit();
    } finally {
      setTextBusy(false);
    }
  }

  function cancelTextEdit() {
    skipTextCommitRef.current = true;
    setTextDraft(text);
    stopTextEdit();
  }

  const bubbleClass = cn(
    "box-border inline-block max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl px-3.5 py-2.5 text-left text-base font-medium leading-relaxed md:text-[15px]",
    meta.mine
      ? "rounded-bl-md bg-primary text-primary-foreground"
      : "rounded-br-md bg-surface text-foreground ring-1 ring-border",
  );

  return (
    <div
      id={`tx-line-${line.id}`}
      data-segment={line.segmentId || undefined}
      className={cn(
        "flex w-full min-w-0 rounded-xl px-0.5 py-0.5 transition-colors",
        meta.mine ? "justify-start" : "justify-end",
        active && "bg-primary-soft/60 ring-1 ring-primary/15",
      )}
    >
      <div
        className={cn(
          // 폭은 globals.css `.faith-chat-bubble-rail` (컨테이너 비율별).
          "faith-chat-bubble-rail flex min-w-0 items-start gap-2.5",
          corrections.length > 0 && "faith-chat-bubble-rail--wide",
          meta.mine ? "flex-row" : "flex-row-reverse",
        )}
      >
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white md:h-8 md:w-8 md:text-xs",
            meta.color,
            meta.mine && "ring-2 ring-primary/25",
          )}
        >
          {meta.initial}
        </div>
        <div
          className={cn(
            "flex min-w-0 max-w-full flex-col gap-2.5",
            meta.mine ? "items-start text-left" : "items-end text-right",
          )}
        >
          <p
            className={cn(
              "flex min-w-0 items-baseline gap-1.5 text-base font-semibold md:text-sm",
              meta.mine ? "text-primary" : "flex-row-reverse text-foreground",
            )}
          >
            <span className="truncate">{meta.label}</span>
            <span className="shrink-0 font-mono text-base font-medium tabular-nums text-muted md:text-xs">
              {line.time}
            </span>
          </p>
          {line.attachment ? (
            <div
              className={cn(
                "group/attach flex max-w-full items-end gap-1",
                meta.mine ? "flex-row" : "flex-row-reverse",
              )}
            >
              <TranscriptAttachmentCard
                attachment={line.attachment}
                hostSide={meta.mine}
              />
              {!text && !hasMemo && !editingMemo ? (
                <button
                  type="button"
                  onClick={() => setEditingMemo(true)}
                  aria-label="메모 추가"
                  title="메모 추가"
                  className={cn(
                    // md는 컨테이너 쿼리 — 채팅 폭이 좁아 뷰포트 미디어로 구분
                    "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-muted transition-all duration-200 ease-out motion-reduce:transition-none [@media(min-width:768px)]:h-10 [@media(min-width:768px)]:w-10",
                    "hover:bg-surface/70 hover:text-foreground",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "[@media(min-width:768px)]:scale-90 [@media(min-width:768px)]:opacity-0 [@media(min-width:768px)]:group-hover/attach:scale-100 [@media(min-width:768px)]:group-hover/attach:opacity-100 [@media(min-width:768px)]:focus-visible:scale-100 [@media(min-width:768px)]:focus-visible:opacity-100",
                  )}
                >
                  <MaterialSymbol name="edit_note" size={22} weight={400} />
                </button>
              ) : null}
            </div>
          ) : null}
          {text ? (
            <div
              className={cn(
                "group/bubble flex max-w-full flex-col gap-2",
                meta.mine ? "items-start" : "items-end",
              )}
            >
              <div
                className={cn(
                  "flex max-w-full items-end gap-1",
                  meta.mine ? "flex-row" : "flex-row-reverse",
                )}
              >
                {editingText && editSize ? (
                  <textarea
                    ref={textEditRef}
                    value={textDraft}
                    disabled={textBusy}
                    aria-label="대사 수정"
                    rows={1}
                    style={bubbleEditLockStyle(editSize)}
                    className={cn(
                      bubbleClass,
                      "max-w-none resize-none overflow-x-hidden overflow-y-auto border-0 outline-none ring-0",
                      meta.mine
                        ? "caret-primary-foreground"
                        : "caret-foreground",
                    )}
                    onChange={(e) => setTextDraft(e.target.value)}
                    onBlur={() => {
                      if (skipTextCommitRef.current) {
                        skipTextCommitRef.current = false;
                        return;
                      }
                      void commitText(textEditRef.current?.value ?? textDraft);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelTextEdit();
                        return;
                      }
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        (e.currentTarget as HTMLTextAreaElement).blur();
                      }
                    }}
                  />
                ) : canStartTextEdit ? (
                  <div
                    ref={bubbleShellRef}
                    role="button"
                    tabIndex={0}
                    aria-label={`${meta.label} 대사 수정`}
                    title="대사 수정"
                    className={cn(
                      bubbleClass,
                      "cursor-text transition-opacity hover:opacity-90",
                    )}
                    onClick={() => beginTextEdit()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        beginTextEdit();
                      }
                    }}
                  >
                    <MaskedText
                      original={text}
                      matches={matches}
                      onPrimary={meta.mine}
                      activeWordRange={activeWordRange}
                      activeWordStrength={activeWordFocus?.strength}
                    />
                  </div>
                ) : onSeek ? (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => onSeek(line)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSeek(line);
                      }
                    }}
                    className={cn(
                      bubbleClass,
                      "cursor-pointer transition-opacity hover:opacity-90",
                    )}
                    aria-label={`${meta.label} 대사부터 재생`}
                  >
                    <MaskedText
                      original={text}
                      matches={matches}
                      onPrimary={meta.mine}
                      activeWordRange={activeWordRange}
                      activeWordStrength={activeWordFocus?.strength}
                      words={line.words}
                      onWordSeek={(word) => onSeek(line, word.startSec)}
                    />
                  </div>
                ) : (
                  <div className={bubbleClass}>
                    <MaskedText
                      original={text}
                      matches={matches}
                      onPrimary={meta.mine}
                      activeWordRange={activeWordRange}
                      activeWordStrength={activeWordFocus?.strength}
                    />
                  </div>
                )}
                {/* 데스크톱: 말풍선 옆 아이콘. 모바일은 아래 라벨 버튼. */}
                {!editingMemo && !editingText ? (
                  <button
                    type="button"
                    onClick={() => setEditingMemo(true)}
                    aria-label={hasMemo ? "메모 수정" : "메모 추가"}
                    title={hasMemo ? "메모 수정" : "메모 추가"}
                    className={cn(
                      // 뷰포트 md+ 에서만 옆 아이콘 (컨테이너 md와 혼동 금지)
                      "hidden h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-all duration-200 ease-out motion-reduce:transition-none [@media(min-width:768px)]:inline-flex",
                      "hover:bg-surface/70 hover:text-foreground",
                      "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      hasMemo
                        ? "opacity-90"
                        : "scale-90 opacity-0 group-hover/bubble:scale-100 group-hover/bubble:opacity-100 focus-visible:scale-100",
                    )}
                  >
                    <MaterialSymbol
                      name="edit_note"
                      size={22}
                      weight={hasMemo ? 500 : 400}
                      filled={hasMemo}
                    />
                  </button>
                ) : null}
              </div>
              {!editingMemo && !editingText && !hasMemo ? (
                <button
                  type="button"
                  onClick={() => setEditingMemo(true)}
                  className="hidden min-h-12 items-center gap-2 rounded-full px-4 text-base font-semibold text-muted transition-colors hover:bg-surface/70 hover:text-foreground [@media(max-width:767px)]:inline-flex"
                >
                  <MaterialSymbol name="edit_note" size={22} weight={500} />
                  메모
                </button>
              ) : null}
            </div>
          ) : null}

          {editingMemo ? (
            <div className="w-full min-w-0 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200/80 md:p-2.5">
              <textarea
                ref={memoRef}
                value={memoDraft}
                onChange={(e) => setMemoDraft(e.target.value)}
                rows={4}
                placeholder="이 대사에 메모를 남겨 주세요"
                aria-label="말풍선 메모"
                className="w-full resize-none rounded-lg bg-transparent px-2 py-2 text-left text-base font-medium leading-relaxed text-foreground outline-none placeholder:text-muted"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setMemoDraft(memo ?? "");
                    setEditingMemo(false);
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    commitMemo();
                  }
                }}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                {hasMemo ? (
                  <button
                    type="button"
                    className="inline-flex min-h-12 items-center rounded-xl px-4 text-base font-semibold text-muted hover:bg-surface/70 hover:text-foreground md:min-h-10 md:px-3 md:text-sm"
                    onClick={() => {
                      setMemoDraft("");
                      onMemoChange(line.id, "");
                      setEditingMemo(false);
                    }}
                  >
                    삭제
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-12 items-center rounded-xl px-4 text-base font-semibold text-muted hover:text-foreground md:min-h-10 md:px-3 md:text-sm"
                    onClick={() => {
                      setMemoDraft(memo ?? "");
                      setEditingMemo(false);
                    }}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="inline-flex min-h-12 items-center rounded-xl bg-foreground px-4 text-base font-semibold text-background md:min-h-10 md:px-3 md:text-sm"
                    onClick={commitMemo}
                  >
                    저장
                  </button>
                </div>
              </div>
            </div>
          ) : hasMemo ? (
            <button
              type="button"
              onClick={() => setEditingMemo(true)}
              aria-label="메모 수정"
              title="메모 수정"
              className={cn(
                "flex max-w-full min-h-12 items-start gap-2.5 rounded-xl bg-amber-50 px-3.5 py-3 text-left text-base font-medium leading-relaxed text-foreground ring-1 ring-amber-200/80 transition-colors hover:bg-amber-100/80 md:min-h-0 md:gap-2 md:px-3 md:py-2 md:text-sm",
                meta.mine && "flex-row-reverse text-right",
              )}
            >
              <MaterialSymbol
                name="edit_note"
                size={22}
                weight={500}
                filled
                className="mt-0.5 shrink-0 text-amber-800/70"
              />
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                {memo}
              </span>
            </button>
          ) : null}

          <CorrectionHint
            corrections={corrections}
            align={meta.mine ? "start" : "end"}
            className="lg:hidden"
            onApply={(correction) => onApplyCorrection(line.id, correction)}
          />
        </div>
        <CorrectionHint
          corrections={corrections}
          align={meta.mine ? "start" : "end"}
          className="hidden w-[12rem] shrink-0 pb-1 lg:flex"
          onApply={(correction) => onApplyCorrection(line.id, correction)}
        />
      </div>
    </div>
  );
}

const ReplayBubbleMemo = memo(ReplayBubble);

/** 실시간 회의와 같은 채팅 UI로 대화기록 다시보기 + 음성 동기 재생. */
export function MeetingChatReplay({
  meeting,
  transcript: initialTranscript,
  audioSrc,
  audioLabel = "다시듣기",
  canEditTitle = false,
}: {
  meeting: Meeting;
  transcript: MeetingTranscript;
  audioSrc?: string | null;
  audioLabel?: string;
  /** 업로드 회의 등 사용자 저장소에 있을 때만 제목·대사 수정 */
  canEditTitle?: boolean;
}) {
  const router = useRouter();
  const { currentUser } = useAppContext();
  const searchParams = useSearchParams();
  const focusLine = searchParams.get("line");
  const focusSegment = searchParams.get("segment");
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
  const [transcript, setTranscript] = useState(initialTranscript);
  const [activeId, setActiveId] = useState<string | null>(focusLine);
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [titleEditMode, setTitleEditMode] = useState(false);
  const [draftTitle, setDraftTitle] = useState(meeting.title);
  const [titleBusy, setTitleBusy] = useState(false);
  const [settings, setSettings] = useState<ChatReplaySettings>(() =>
    readChatReplaySettings(),
  );
  const followChat = settings.followChat !== false;
  const wordFocus = settings.wordFocus !== false;
  const audioRef = useRef<HTMLAudioElement>(null);
  const meName = resolveMeName(meeting.participants, currentUser.name);
  const hasAudio = Boolean(audioSrc);

  const lineStarts = useMemo(
    () => transcript.lines.map(lineStartSec),
    [transcript.lines],
  );

  const fallbackDurationSec = useMemo(() => {
    return Math.max(
      estimateTranscriptDurationSec(transcript.lines),
      parseDurationLabelToSec(meeting.duration),
    );
  }, [transcript.lines, meeting.duration]);

  useEffect(() => {
    setDurationSec((prev) => {
      if (prev > 0) return prev;
      return fallbackDurationSec;
    });
  }, [fallbackDurationSec]);

  useEffect(() => {
    setTranscript(initialTranscript);
  }, [meeting.id, initialTranscript]);

  useEffect(() => {
    if (titleEditMode) return;
    setDraftTitle(meeting.title);
  }, [meeting.title, titleEditMode]);

  const handleMemoChange = useCallback((lineId: string, next: string) => {
    setTranscript((prev) => ({
      ...prev,
      lines: prev.lines.map((line) =>
        line.id === lineId ? { ...line, memo: next.trim() || undefined } : line,
      ),
    }));
    void patchMeeting(meeting.id, { setMemo: { lineId, memo: next } });
  }, [meeting.id]);

  const handleLineTextChange = useCallback(
    async (lineId: string, next: string) => {
      const text = next.trim();
      if (!text) return;
      const ok = await patchMeeting(meeting.id, {
        setLineText: { lineId, text },
      });
      if (!ok) return;
      setTranscript((prev) => ({
        ...prev,
        lines: prev.lines.map((line) => {
          if (line.id !== lineId) return line;
          const prevText = line.text ?? "";
          const clearWords =
            !line.words?.length ||
            Math.abs(text.length - prevText.length) >
              Math.max(8, Math.floor(prevText.length * 0.2));
          return {
            ...line,
            text,
            words: clearWords ? undefined : line.words,
            corrections: undefined,
          };
        }),
      }));
      router.refresh();
    },
    [meeting.id, router],
  );

  async function saveTitleEdit() {
    if (!canEditTitle || titleBusy) return;
    const next = draftTitle.trim();
    if (!next) return;
    if (next === meeting.title) {
      setTitleEditMode(false);
      return;
    }
    setTitleBusy(true);
    try {
      const ok = await patchMeeting(meeting.id, { title: next });
      if (!ok) return;
      setTitleEditMode(false);
      router.refresh();
    } finally {
      setTitleBusy(false);
    }
  }

  const handleApplyCorrection = useCallback(
    (lineId: string, correction: TranscriptCorrection) => {
      setTranscript((prev) => ({
        ...prev,
        lines: prev.lines.map((line) => {
          if (line.id !== lineId) return line;
          const text = line.text ?? "";
          const { wrong, suggestion, startOffset, endOffset } = correction;
          let nextText = text;
          if (
            typeof startOffset === "number" &&
            typeof endOffset === "number" &&
            text.slice(startOffset, endOffset) === wrong
          ) {
            nextText =
              text.slice(0, startOffset) + suggestion + text.slice(endOffset);
          } else {
            const at = text.indexOf(wrong);
            if (at >= 0) {
              nextText =
                text.slice(0, at) + suggestion + text.slice(at + wrong.length);
            }
          }
          return {
            ...line,
            text: nextText,
            words: undefined,
            corrections: line.corrections?.filter(
              (c) => !(c.wrong === wrong && c.suggestion === suggestion),
            ),
          };
        }),
      }));
      void patchMeeting(meeting.id, {
        applyCorrection: {
          lineId,
          wrong: correction.wrong,
          suggestion: correction.suggestion,
          startOffset: correction.startOffset,
          endOffset: correction.endOffset,
        },
      });
    },
    [meeting.id],
  );

  useEffect(() => {
    const lineId =
      focusLine ||
      (focusSegment
        ? transcript.lines.find((l) => l.segmentId === focusSegment)?.id
        : null);
    if (!lineId) return;
    const syncId = window.setTimeout(() => setActiveId(lineId), 0);
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`tx-line-${lineId}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => {
      window.clearTimeout(syncId);
      cancelAnimationFrame(frame);
    };
  }, [focusLine, focusSegment, transcript.lines]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a || !hasAudio) return;

    a.playbackRate = settings.rate;
    a.muted = settings.muted;
    a.volume = settings.muted ? 0 : Math.min(1, Math.max(0, settings.volume));

    let raf = 0;
    const syncFromMedia = () => {
      const media = a.currentTime;
      setCurrentSec((prev) =>
        Math.abs(prev - media) < 0.012 ? prev : media,
      );
      const idx = activeLineIndexAt(lineStarts, media);
      if (idx < 0) return;
      const line = transcript.lines[idx];
      if (!line) return;
      setActiveId((prev) => (prev === line.id ? prev : line.id));
    };
    const tick = () => {
      syncFromMedia();
      if (!a.paused && !a.ended) {
        raf = requestAnimationFrame(tick);
      }
    };
    const onPlay = () => {
      setPlaying(true);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      syncFromMedia();
    };
    const onEnded = () => {
      setPlaying(false);
      cancelAnimationFrame(raf);
      syncFromMedia();
    };
    const onSeeked = () => syncFromMedia();

    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("seeked", onSeeked);
    // 일시정지·탭 복귀 때도 한 번 맞춘다. 재생 중 단어 포커스는 rAF가 담당.
    a.addEventListener("timeupdate", syncFromMedia);

    if (!a.paused && !a.ended) {
      raf = requestAnimationFrame(tick);
    } else {
      syncFromMedia();
    }

    return () => {
      cancelAnimationFrame(raf);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("seeked", onSeeked);
      a.removeEventListener("timeupdate", syncFromMedia);
    };
  }, [hasAudio, lineStarts, settings.muted, settings.rate, settings.volume, transcript.lines]);

  const tryPlay = useCallback((a: HTMLAudioElement) => {
    setAudioError(null);
    try {
      const result = a.play();
      if (result && typeof result.catch === "function") {
        void result.catch(() => {
          if (audioRef.current !== a) return;
          setPlaying(false);
          setAudioError("음성 파일을 재생하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        });
      }
    } catch {
      setPlaying(false);
      setAudioError("음성 파일을 재생하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }, []);

  useEffect(() => {
    if (!followChat || !activeId) return;
    document
      .getElementById(`tx-line-${activeId}`)
      ?.scrollIntoView({
        block: "nearest",
        // 재생 중 smooth는 이전 스크롤과 겹쳐 버벅인다.
        behavior: playing ? "auto" : "smooth",
      });
  }, [activeId, playing, followChat]);

  const patchReplaySettings = useCallback(
    (partial: Partial<ChatReplaySettings>) => {
      setSettings((prev) => {
        const next: ChatReplaySettings = {
          ...prev,
          ...partial,
          followChat:
            typeof partial.followChat === "boolean"
              ? partial.followChat
              : typeof prev.followChat === "boolean"
                ? prev.followChat
                : true,
          wordFocus:
            typeof partial.wordFocus === "boolean"
              ? partial.wordFocus
              : typeof prev.wordFocus === "boolean"
                ? prev.wordFocus
                : true,
        };
        writeChatReplaySettings(next);
        return next;
      });
    },
    [],
  );

  const displayDurationSec =
    durationSec > 0 ? durationSec : fallbackDurationSec;

  const activeLine = transcript.lines.find((l) => l.id === activeId);
  const activeSpeakerLabel = activeLine
    ? personMeta(activeLine.speaker, meeting.participants, meName).label
    : "";

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) tryPlay(a);
    else a.pause();
  }

  const seekToLine = useCallback(
    (line: TranscriptLine, atSec?: number) => {
      const a = audioRef.current;
      if (!a || !hasAudio) {
        setActiveId(line.id);
        return;
      }
      const lineSec =
        typeof atSec === "number" && Number.isFinite(atSec)
          ? Math.max(0, atSec)
          : lineStartSec(line);
      const dur =
        readMediaDurationSec(a) || durationSec || fallbackDurationSec;
      if (dur > 0 && lineSec > dur + 0.5) {
        setActiveId(line.id);
        return;
      }
      const media = Math.min(
        Math.max(0, lineSec),
        Math.max(0, dur - 0.05),
      );
      a.currentTime = media;
      setCurrentSec(media);
      setActiveId(line.id);
      tryPlay(a);
    },
    [hasAudio, durationSec, fallbackDurationSec, tryPlay],
  );

  function seekRatio(ratio: number) {
    const a = audioRef.current;
    if (!a) return;
    const dur =
      readMediaDurationSec(a) || durationSec || fallbackDurationSec;
    a.currentTime = Math.min(Math.max(0, ratio * dur), Math.max(0, dur - 0.05));
  }

  function seekBySec(deltaSec: number) {
    const a = audioRef.current;
    if (!a) return;
    const dur =
      readMediaDurationSec(a) || durationSec || fallbackDurationSec;
    const next = Math.min(
      Math.max(0, a.currentTime + deltaSec),
      Math.max(0, dur - 0.05),
    );
    a.currentTime = next;
    setCurrentSec(next);
  }

  return (
    <div className="flex h-[calc(100dvh-0.25rem-env(safe-area-inset-bottom,0px))] w-full min-w-0 flex-col gap-2 md:h-[calc(100dvh-0.5rem)] md:gap-3">
      {hasAudio && audioSrc ? (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="metadata"
          muted={settings.muted}
          onLoadedMetadata={(e) => {
            const el = e.currentTarget;
            setAudioError(null);
            el.volume = settings.muted
              ? 0
              : Math.min(1, Math.max(0, settings.volume));
            const mediaDur = readMediaDurationSec(el);
            setDurationSec(mediaDur > 0 ? mediaDur : fallbackDurationSec);
          }}
          onCanPlay={() => setAudioError(null)}
          onError={() => {
            setPlaying(false);
            setAudioError("음성 파일을 불러오지 못했습니다. 다시 시도해 주세요.");
          }}
          onDurationChange={(e) => {
            const mediaDur = readMediaDurationSec(e.currentTarget);
            if (mediaDur > 0) setDurationSec(mediaDur);
          }}
        />
      ) : null}

      {audioError ? (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-3 py-2.5 text-base font-medium text-red-700 ring-1 ring-red-200/80 md:text-sm"
        >
          {audioError}
        </p>
      ) : null}

      <ChatReplayHeaderBar
        leading={
          <MeetingRecordBackLink
            href={`/meetings/${meeting.id}`}
            alwaysVisible
          />
        }
        center={
          <MeetingTitleHeading
            title={titleEditMode ? draftTitle : meeting.title}
            editMode={titleEditMode}
            draftTitle={draftTitle}
            onDraftTitleChange={setDraftTitle}
            disabled={titleBusy}
            align="center"
            size="header"
            className="w-full"
          />
        }
        trailing={
          <div className="flex min-w-0 shrink-0 items-center gap-0.5">
            {canEditTitle ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-12 w-12 shrink-0 text-muted hover:bg-surface/70 hover:text-foreground md:h-11 md:w-11 [&_svg]:size-5"
                aria-label={titleEditMode ? "완료" : "수정"}
                title={titleEditMode ? "완료" : "기록 수정"}
                disabled={titleBusy}
                onClick={() => {
                  if (titleEditMode) {
                    void saveTitleEdit();
                    return;
                  }
                  setDraftTitle(meeting.title);
                  setTitleEditMode(true);
                }}
              >
                {titleEditMode ? (
                  <Check strokeWidth={1.75} />
                ) : (
                  <Pencil strokeWidth={1.75} />
                )}
              </Button>
            ) : null}
            <ChatReplayTools
              meeting={meeting}
              transcript={transcript}
              maskStyle={maskStyle}
              onMaskChange={setMaskStyle}
              followChat={followChat}
              wordFocus={wordFocus}
              onReplaySettingsChange={patchReplaySettings}
            />
          </div>
        }
      />

      <div className="faith-chat-pane min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-1 py-3 sm:px-0 md:py-4">
        {transcript.lines.length === 0 ? (
          <p className="py-12 text-center text-base text-muted">
            대화기록이 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-4 md:gap-3.5">
            {transcript.lines.map((line) => (
              <li key={line.id}>
                <ReplayBubbleMemo
                  line={line}
                  participants={meeting.participants}
                  meName={meName}
                  maskStyle={maskStyle}
                  active={activeId === line.id}
                  currentSec={activeId === line.id ? currentSec : 0}
                  wordFocus={wordFocus}
                  playing={playing}
                  canEditText={canEditTitle}
                  onSeek={hasAudio ? seekToLine : undefined}
                  onLineTextChange={
                    canEditTitle ? handleLineTextChange : undefined
                  }
                  onMemoChange={handleMemoChange}
                  onApplyCorrection={handleApplyCorrection}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasAudio && audioSrc ? (
        <div className="mr-auto w-full max-w-3xl shrink-0">
          <MeetingChatReplayBar
            audioLabel={audioLabel}
            currentSec={currentSec}
            durationSec={displayDurationSec}
            playing={playing}
            activeLineLabel={activeSpeakerLabel}
            settings={settings}
            onSettingsChange={setSettings}
            onTogglePlay={togglePlay}
            onSeekRatio={seekRatio}
            onSeekBySec={seekBySec}
          />
        </div>
      ) : null}
    </div>
  );
}
