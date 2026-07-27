"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { TranscriptAttachmentCard } from "@/components/meetings/meeting-attachments";
import {
  MeetingChatReplayBar,
  readChatReplaySettings,
  type ChatReplaySettings,
} from "@/components/meetings/meeting-chat-replay-bar";
import { CorrectionHint } from "@/components/meetings/correction-hint";
import { MaskedText } from "@/components/meetings/masked-text";
import { MaskStylePopup } from "@/components/meetings/mask-style-picker";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-context";
import { maskPii, type MaskStyle } from "@/lib/masking";
import { activeLineIndexAt, lineStartSec } from "@/lib/transcript-time";
import type { Meeting, Participant } from "@/types/meeting";
import type { MeetingTranscript, TranscriptLine } from "@/types/transcript";
import { cn } from "@/lib/utils";

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
}: {
  line: TranscriptLine;
  participants: Participant[];
  meName: string;
  maskStyle: MaskStyle;
  active: boolean;
  onSeek?: () => void;
}) {
  const meta = personMeta(line.speaker, participants, meName);
  const text = line.text ?? "";
  const matches = text ? maskPii(text, { style: maskStyle }).matches : [];
  const corrections = line.corrections ?? [];

  return (
    <div
      id={`tx-line-${line.id}`}
      data-segment={line.segmentId || undefined}
      className={cn(
        "flex w-full min-w-0 rounded-xl px-1 py-0.5 transition-colors",
        meta.mine ? "justify-end" : "justify-start",
        active && "bg-primary-soft/60 ring-1 ring-primary/15",
      )}
    >
      <div
        className={cn(
          "flex max-w-[min(85%,22rem)] items-end gap-2.5",
          corrections.length > 0 && "lg:max-w-[min(92%,36rem)]",
          meta.mine ? "flex-row-reverse" : "flex-row",
        )}
      >
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
            meta.color,
            meta.mine && "ring-2 ring-primary/25",
          )}
        >
          {meta.initial}
        </div>
        <div
          className={cn(
            "flex min-w-0 flex-col gap-2.5 lg:max-w-[22rem]",
            meta.mine ? "items-end text-right" : "items-start text-left",
          )}
        >
          <p
            className={cn(
              "flex min-w-0 items-baseline gap-1.5 text-xs font-semibold",
              meta.mine ? "flex-row-reverse text-primary" : "text-foreground",
            )}
          >
            <span className="truncate">{meta.label}</span>
            <span className="shrink-0 font-mono text-xs font-medium tabular-nums text-muted">
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
                  "inline-block max-w-full cursor-pointer whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-left text-[14px] font-medium leading-relaxed transition-opacity hover:opacity-90",
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
                  "inline-block max-w-full whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-left text-[14px] font-medium leading-relaxed",
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
  audioLabel = "회의 녹음",
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
  }, [hasAudio, lineStarts, settings.rate, transcript.lines]);

  useEffect(() => {
    if (!settings.follow || !activeId) return;
    document
      .getElementById(`tx-line-${activeId}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeId, settings.follow, playing]);

  const activeLine = transcript.lines.find((l) => l.id === activeId);
  const activeLineLabel = activeLine?.text?.trim()
    ? `${activeLine.speaker}: ${activeLine.text}`
    : activeLine
      ? activeLine.speaker
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

  return (
    <div className="mx-auto flex h-[calc(100dvh-2rem)] max-w-3xl flex-col gap-3">
      {hasAudio && audioSrc ? (
        <audio
          ref={audioRef}
          src={audioSrc}
          preload="metadata"
          muted={settings.muted}
          onLoadedMetadata={(e) => {
            setDurationSec(e.currentTarget.duration || 0);
          }}
          onDurationChange={(e) => {
            setDurationSec(e.currentTarget.duration || 0);
          }}
        />
      ) : null}

      <div className="flex shrink-0 items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/meetings/${meeting.id}`}>
            <ArrowLeft className="h-4 w-4" />
            회의 상세
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold tracking-tight text-foreground">
            {meeting.title}
          </h1>
          <p className="text-xs font-medium text-muted">
            {hasAudio ? "대화기록, 음성 다시듣기" : "대화기록"}
          </p>
        </div>
        <MaskStylePopup value={maskStyle} onChange={setMaskStyle} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-card px-3 py-4 shadow-soft sm:px-4">
        {transcript.lines.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted">
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
          activeLineLabel={activeLineLabel}
          settings={settings}
          onSettingsChange={setSettings}
          onTogglePlay={togglePlay}
          onSeekRatio={seekRatio}
        />
      ) : null}
    </div>
  );
}
