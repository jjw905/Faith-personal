"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { TranscriptAttachmentCard } from "@/components/meetings/meeting-attachments";
import {
  MeetingChatReplayBar,
  readChatReplaySettings,
  type ChatReplaySettings,
} from "@/components/meetings/meeting-chat-replay-bar";
import { ChatReplayTools } from "@/components/meetings/chat-replay-tools";
import { CorrectionHint } from "@/components/meetings/correction-hint";
import { MaskedText } from "@/components/meetings/masked-text";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-context";
import { maskPii, type MaskStyle } from "@/lib/masking";
import { activeLineIndexAt, lineStartSec } from "@/lib/transcript-time";
import type { Meeting, Participant } from "@/types/meeting";
import type { MeetingTranscript, TranscriptLine } from "@/types/transcript";
import { cn } from "@/lib/utils";

const MEMO_KEY_PREFIX = "faith.chat-replay.memos.";

function readLineMemos(meetingId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(`${MEMO_KEY_PREFIX}${meetingId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.trim()) next[key] = value;
    }
    return next;
  } catch {
    return {};
  }
}

function writeLineMemos(meetingId: string, memos: Record<string, string>) {
  try {
    window.localStorage.setItem(
      `${MEMO_KEY_PREFIX}${meetingId}`,
      JSON.stringify(memos),
    );
  } catch {
    // ignore
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
  onSeek,
  memo,
  memoMode,
  onMemoChange,
}: {
  line: TranscriptLine;
  participants: Participant[];
  meName: string;
  maskStyle: MaskStyle;
  active: boolean;
  onSeek?: () => void;
  memo?: string;
  memoMode: boolean;
  onMemoChange: (next: string) => void;
}) {
  const meta = personMeta(line.speaker, participants, meName);
  const text = line.text ?? "";
  const matches = text ? maskPii(text, { style: maskStyle }).matches : [];
  const corrections = line.corrections ?? [];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(memo ?? "");
  const hasMemo = Boolean(memo?.trim());

  useEffect(() => {
    if (!editing) setDraft(memo ?? "");
  }, [memo, editing]);

  function commitMemo() {
    onMemoChange(draft.trim());
    setEditing(false);
  }

  return (
    <div
      id={`tx-line-${line.id}`}
      data-segment={line.segmentId || undefined}
      className={cn(
        "flex w-full min-w-0 rounded-xl px-0.5 py-0.5 transition-colors",
        meta.mine ? "justify-end" : "justify-start",
        active && "bg-primary-soft/60 ring-1 ring-primary/15",
      )}
    >
      <div
        className={cn(
            "flex w-[min(78%,28rem)] max-w-full min-w-0 items-start gap-2.5",
            corrections.length > 0 && "sm:w-[min(86%,34rem)]",
          meta.mine ? "flex-row-reverse" : "flex-row",
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
            "flex min-w-0 flex-1 flex-col gap-2.5",
            meta.mine ? "items-end text-right" : "items-start text-left",
          )}
        >
          <p
            className={cn(
              "flex min-w-0 items-baseline gap-1.5 text-base font-semibold md:text-sm",
              meta.mine ? "flex-row-reverse text-primary" : "text-foreground",
            )}
          >
            <span className="truncate">{meta.label}</span>
            <span className="shrink-0 font-mono text-sm font-medium tabular-nums text-muted md:text-xs">
              {line.time}
            </span>
          </p>
          {line.attachment ? (
            <TranscriptAttachmentCard
              attachment={line.attachment}
              hostSide={meta.mine}
            />
          ) : null}
          {text ? (
            onSeek ? (
              <div
                role="button"
                tabIndex={0}
                onClick={onSeek}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSeek();
                  }
                }}
                className={cn(
                  "inline-block max-w-full cursor-pointer whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl px-3.5 py-2.5 text-left text-base font-medium leading-relaxed transition-opacity hover:opacity-90 md:text-[15px]",
                  meta.mine
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md bg-surface text-foreground ring-1 ring-border",
                )}
                aria-label={`${meta.label} 대사부터 재생`}
              >
                <MaskedText
                  original={text}
                  matches={matches}
                  onPrimary={meta.mine}
                />
              </div>
            ) : (
              <div
                className={cn(
                  "inline-block max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-2xl px-3.5 py-2.5 text-left text-base font-medium leading-relaxed md:text-[15px]",
                  meta.mine
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md bg-surface text-foreground ring-1 ring-border",
                )}
              >
                <MaskedText
                  original={text}
                  matches={matches}
                  onPrimary={meta.mine}
                />
              </div>
            )
          ) : null}

          {editing ? (
            <div className="w-full min-w-0 rounded-xl bg-amber-50 p-2 ring-1 ring-amber-200/80">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                autoFocus
                placeholder="이 대사에 메모를 남겨 주세요"
                aria-label="말풍선 메모"
                className="w-full resize-none rounded-lg bg-transparent px-1 py-1 text-left text-base font-medium text-foreground outline-none placeholder:text-muted md:text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setDraft(memo ?? "");
                    setEditing(false);
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    commitMemo();
                  }
                }}
              />
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  className="min-h-10 rounded-lg px-3 text-sm font-semibold text-muted hover:text-foreground"
                  onClick={() => {
                    setDraft(memo ?? "");
                    setEditing(false);
                  }}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="min-h-10 rounded-lg bg-foreground px-3 text-sm font-semibold text-background"
                  onClick={commitMemo}
                >
                  저장
                </button>
              </div>
            </div>
          ) : hasMemo ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={cn(
                "max-w-full rounded-xl bg-amber-50 px-3 py-2 text-left text-base font-medium leading-relaxed text-foreground ring-1 ring-amber-200/80 transition-colors hover:bg-amber-100/80 md:text-sm",
                meta.mine && "text-right",
              )}
            >
              {memo}
            </button>
          ) : memoMode ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
            >
              메모 추가
            </button>
          ) : null}

          <CorrectionHint
            corrections={corrections}
            align={meta.mine ? "end" : "start"}
            className="lg:hidden"
          />
        </div>
        <CorrectionHint
          corrections={corrections}
          align={meta.mine ? "end" : "start"}
          className="hidden w-[12rem] shrink-0 pb-1 lg:flex"
        />
      </div>
    </div>
  );
}

/** 실시간 회의와 같은 채팅 UI로 대화기록 다시보기 + 음성 동기 재생. */
export function MeetingChatReplay({
  meeting,
  transcript,
  audioSrc,
  audioLabel = "다시듣기",
}: {
  meeting: Meeting;
  transcript: MeetingTranscript;
  audioSrc?: string | null;
  audioLabel?: string;
}) {
  const { currentUser } = useAppContext();
  const searchParams = useSearchParams();
  const focusLine = searchParams.get("line");
  const focusSegment = searchParams.get("segment");
  const [maskStyle, setMaskStyle] = useState<MaskStyle>("partial");
  const [memoMode, setMemoMode] = useState(false);
  const [lineMemos, setLineMemos] = useState<Record<string, string>>({});
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(focusLine);
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [settings, setSettings] = useState<ChatReplaySettings>(() =>
    readChatReplaySettings(),
  );
  const audioRef = useRef<HTMLAudioElement>(null);
  const meName = resolveMeName(meeting.participants, currentUser.name);
  const hasAudio = Boolean(audioSrc);

  const lineStarts = useMemo(
    () => transcript.lines.map(lineStartSec),
    [transcript.lines],
  );

  useEffect(() => {
    setLineMemos(readLineMemos(meeting.id));
  }, [meeting.id]);

  function setLineMemo(lineId: string, next: string) {
    setLineMemos((prev) => {
      const copy = { ...prev };
      if (next.trim()) copy[lineId] = next.trim();
      else delete copy[lineId];
      writeLineMemos(meeting.id, copy);
      return copy;
    });
  }

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

    const onTime = () => {
      const media = a.currentTime;
      setCurrentSec(media);
      const idx = activeLineIndexAt(lineStarts, media);
      if (idx < 0) return;
      const line = transcript.lines[idx];
      if (!line) return;
      setActiveId(line.id);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);

    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);

    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
    };
  }, [hasAudio, lineStarts, settings.muted, settings.rate, settings.volume, transcript.lines]);

  useEffect(() => {
    if (!activeId) return;
    document
      .getElementById(`tx-line-${activeId}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId, playing]);

  const activeLine = transcript.lines.find((l) => l.id === activeId);
  const activeSpeakerLabel = activeLine
    ? personMeta(activeLine.speaker, meeting.participants, meName).label
    : "";

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }

  function seekToLine(line: TranscriptLine) {
    const a = audioRef.current;
    if (!a || !hasAudio) {
      setActiveId(line.id);
      return;
    }
    const lineSec = lineStartSec(line);
    const dur = a.duration || durationSec;
    if (dur > 0 && lineSec > dur + 0.5) {
      // 녹음 길이 밖 대사 — 재생만 맞추지 않고 하이라이트만.
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
    void a.play();
  }

  function seekRatio(ratio: number) {
    const a = audioRef.current;
    if (!a) return;
    const dur = a.duration || durationSec;
    a.currentTime = Math.min(Math.max(0, ratio * dur), Math.max(0, dur - 0.05));
  }

  function seekBySec(deltaSec: number) {
    const a = audioRef.current;
    if (!a) return;
    const dur = a.duration || durationSec;
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
            el.volume = settings.muted
              ? 0
              : Math.min(1, Math.max(0, settings.volume));
            setDurationSec(el.duration || 0);
          }}
          onDurationChange={(e) => {
            setDurationSec(e.currentTarget.duration || 0);
          }}
        />
      ) : null}

      <div className="grid min-w-0 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5 py-2 sm:gap-2 sm:py-2.5 md:py-3">
        <div className="min-w-0 shrink-0 justify-self-start">
          <Button
            asChild
            variant="ghost"
            className="-ml-2 h-12 shrink-0 gap-1.5 px-2 text-base font-semibold md:h-9 md:px-2.5 md:text-sm"
          >
            <Link href={`/meetings/${meeting.id}`}>
              <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={1.75} />
              돌아가기
            </Link>
          </Button>
        </div>
        <div className="flex min-w-0 items-center justify-center justify-self-stretch px-1">
          <button
            type="button"
            onClick={() => setTitleExpanded((v) => !v)}
            aria-expanded={titleExpanded}
            title={meeting.title}
            className="w-full min-w-0 cursor-pointer text-center"
          >
            <h1
              className={cn(
                "text-xl font-bold tracking-tight text-foreground sm:text-2xl md:text-xl",
                titleExpanded ? "line-clamp-2 break-words" : "truncate",
              )}
            >
              {meeting.title}
            </h1>
          </button>
        </div>
        <div className="min-w-0 shrink-0 justify-self-end">
          <ChatReplayTools
            meeting={meeting}
            transcript={transcript}
            maskStyle={maskStyle}
            onMaskChange={setMaskStyle}
            memoMode={memoMode}
            onMemoModeChange={setMemoMode}
          />
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-2xl bg-white px-2 py-4 ring-1 ring-border/50 sm:px-3 md:px-4">
        {transcript.lines.length === 0 ? (
          <p className="py-12 text-center text-base text-muted">
            대화기록이 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-3.5">
            {transcript.lines.map((line) => (
              <li key={line.id}>
                <ReplayBubble
                  line={line}
                  participants={meeting.participants}
                  meName={meName}
                  maskStyle={maskStyle}
                  active={activeId === line.id}
                  onSeek={hasAudio ? () => seekToLine(line) : undefined}
                  memo={lineMemos[line.id]}
                  memoMode={memoMode}
                  onMemoChange={(next) => setLineMemo(line.id, next)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {hasAudio && audioSrc ? (
        <MeetingChatReplayBar
          audioLabel={audioLabel}
          currentSec={currentSec}
          durationSec={durationSec}
          playing={playing}
          activeLineLabel={activeSpeakerLabel}
          settings={settings}
          onSettingsChange={setSettings}
          onTogglePlay={togglePlay}
          onSeekRatio={seekRatio}
          onSeekBySec={seekBySec}
        />
      ) : null}
    </div>
  );
}
