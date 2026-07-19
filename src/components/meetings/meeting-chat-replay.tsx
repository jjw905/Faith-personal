"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { TranscriptAttachmentCard } from "@/components/meetings/meeting-attachments";
import { MaskedText } from "@/components/meetings/masked-text";
import { MaskStylePopup } from "@/components/meetings/mask-style-picker";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-context";
import { maskPii, type MaskStyle } from "@/lib/masking";
import type { Meeting, Participant } from "@/types/meeting";
import type { MeetingTranscript, TranscriptLine } from "@/types/transcript";
import { cn } from "@/lib/utils";

function resolveMeName(participants: Participant[], currentName: string) {
  if (participants.some((p) => p.name === currentName)) return currentName;
  const host = participants.find((p) => p.isHost);
  if (host) return host.name;
  const member = participants.find((p) => p.isMember);
  return member?.name ?? participants[0]?.name ?? currentName;
}

function isMyLine(speaker: string, meName: string) {
  return (
    speaker === meName ||
    speaker === "나" ||
    speaker === "진행자"
  );
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
}: {
  line: TranscriptLine;
  participants: Participant[];
  meName: string;
  maskStyle: MaskStyle;
  active: boolean;
}) {
  const meta = personMeta(line.speaker, participants, meName);
  const text = line.text ?? "";
  const matches = text ? maskPii(text, { style: maskStyle }).matches : [];

  return (
    <div
      id={`tx-line-${line.id}`}
      data-segment={line.segmentId || undefined}
      className={cn(
        "flex w-full min-w-0 rounded-xl px-1 py-0.5",
        meta.mine ? "justify-end" : "justify-start",
        active && "bg-primary-soft/50",
      )}
    >
      <div
        className={cn(
          "flex max-w-[min(85%,22rem)] items-end gap-2.5",
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
          "flex min-w-0 flex-col gap-2.5",
          meta.mine ? "items-end text-right" : "items-start text-left",
        )}
      >
        <p
          className={cn(
            "flex min-w-0 items-baseline gap-1.5 text-[11px] font-semibold",
            meta.mine
              ? "flex-row-reverse text-primary"
              : "text-foreground",
          )}
        >
          <span className="truncate">{meta.label}</span>
          <span className="shrink-0 font-mono text-[10px] font-medium tabular-nums text-muted">
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
        ) : null}
      </div>
      </div>
    </div>
  );
}

/** 실시간 회의와 같은 채팅 UI로 대화기록 다시보기. */
export function MeetingChatReplay({
  meeting,
  transcript,
}: {
  meeting: Meeting;
  transcript: MeetingTranscript;
}) {
  const { currentUser } = useAppContext();
  const searchParams = useSearchParams();
  const focusLine = searchParams.get("line");
  const focusSegment = searchParams.get("segment");
  const [maskStyle, setMaskStyle] = useState<MaskStyle>("partial");
  const [activeId, setActiveId] = useState<string | null>(focusLine);
  const listRef = useRef<HTMLDivElement>(null);
  const meName = resolveMeName(meeting.participants, currentUser.name);

  useEffect(() => {
    const lineId =
      focusLine ||
      (focusSegment
        ? transcript.lines.find((l) => l.segmentId === focusSegment)?.id
        : null);
    if (!lineId) return;
    setActiveId(lineId);
    const frame = requestAnimationFrame(() => {
      document
        .getElementById(`tx-line-${lineId}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusLine, focusSegment, transcript.lines]);

  return (
    <div className="mx-auto flex h-[calc(100dvh-2rem)] max-w-3xl flex-col">
      <div className="mb-3 flex shrink-0 items-center gap-2">
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
          <p className="text-xs font-medium text-muted">대화기록</p>
        </div>
        <MaskStylePopup value={maskStyle} onChange={setMaskStyle} />
      </div>

      <div
        ref={listRef}
        className="min-h-0 flex-1 overflow-y-auto rounded-2xl bg-card px-3 py-4 shadow-soft sm:px-4"
      >
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
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
