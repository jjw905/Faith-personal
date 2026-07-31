"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { FIXTURE_MEETING } from "@/components/design/fixtures";
import { ReplayStage } from "@/components/design/preview-stage";
import {
  MeetingProcessLoader,
  formatEtaLabel,
  estimateRemainingSec,
  type MeetingProcessPhase,
} from "@/components/meetings/meeting-process-banner";
import {
  MeetingDateTimeMeta,
  MeetingTitleHeading,
} from "@/components/meetings/meeting-record-actions";
import { MeetingCaptureChip } from "@/components/meetings/meeting-capture-label";
import { Button } from "@/components/ui/button";

/** 구간별 ease로 1→100 느낌을 다양하게. */
function segmentEase(t: number) {
  const x = Math.min(1, Math.max(0, t));
  if (x < 0.22) {
    const u = x / 0.22;
    return 0.18 * (u * u);
  }
  if (x < 0.55) {
    const u = (x - 0.22) / 0.33;
    return 0.18 + 0.4 * (1 - (1 - u) * (1 - u));
  }
  if (x < 0.82) {
    const u = (x - 0.55) / 0.27;
    return 0.58 + 0.28 * u;
  }
  const u = (x - 0.82) / 0.18;
  return 0.86 + 0.14 * (1 - (1 - u) ** 2.4);
}

function useRisingPercent(
  play: number,
  from: number,
  to: number,
  durationMs: number,
) {
  const [percent, setPercent] = useState(from);

  useEffect(() => {
    setPercent(from);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      setPercent(from + (to - from) * segmentEase(t));
      if (t < 1) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [play, from, to, durationMs]);

  return percent;
}

function DetailChrome({
  phase,
  progressPercent,
  error,
  etaLabel,
}: {
  phase: MeetingProcessPhase;
  progressPercent?: number;
  error?: string | null;
  etaLabel?: string | null;
}) {
  const meeting = FIXTURE_MEETING;
  const active = phase === "transcribing" || phase === "structuring";
  const failed = phase === "error";

  return (
    <div className="h-full min-h-full bg-white">
      <div
        className={
          active || failed
            ? "mx-auto flex h-full min-h-full max-w-3xl flex-col px-4 py-6 sm:px-6"
            : "mx-auto h-full min-h-full max-w-3xl px-4 py-6 sm:px-6"
        }
      >
        <div className="shrink-0">
          <Button
            asChild
            variant="ghost"
            className="-ml-2 mb-3 h-12 gap-1.5 px-2 text-base font-semibold md:h-9 md:px-2.5 md:text-sm"
          >
            <Link href="/dashboard">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
              돌아가기
            </Link>
          </Button>

          <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1.5">
            <div
              className="pointer-events-none invisible h-12 w-[6.5rem] shrink-0 md:h-9 md:w-[4.75rem]"
              aria-hidden
            />
            <div className="flex min-w-0 items-center justify-center justify-self-stretch px-1">
              <MeetingDateTimeMeta
                meetingId={meeting.id}
                date={meeting.date}
                duration={meeting.duration}
                canEdit={false}
                variant="header"
              />
            </div>
            <div
              className="pointer-events-none invisible h-12 w-[6.5rem] shrink-0 md:h-9 md:w-[4.75rem]"
              aria-hidden
            />
          </div>

          <div className="mt-4">
            <MeetingCaptureChip meeting={meeting} className="mb-3" />
            <MeetingTitleHeading
              meetingId={meeting.id}
              title={meeting.title}
              canEdit={false}
            />
          </div>
        </div>

        <section
          className={
            active || failed
              ? "flex flex-1 flex-col items-center justify-center"
              : undefined
          }
        >
          <MeetingProcessLoader
            phase={phase}
            progressPercent={progressPercent}
            error={error}
            etaLabel={etaLabel}
          />
        </section>
      </div>
    </div>
  );
}

function RisingDetailChrome({
  play,
  phase,
  from,
  to,
  durationMs,
}: {
  play: number;
  phase: MeetingProcessPhase;
  from: number;
  to: number;
  durationMs: number;
}) {
  const percent = useRisingPercent(play, from, to, durationMs);
  const rate = Math.max(0.01, (to - from) / (durationMs / 1000));
  const remaining = estimateRemainingSec({
    percent,
    percentPerSec: rate,
  });
  const etaLabel = remaining != null ? formatEtaLabel(remaining) : null;
  return (
    <DetailChrome
      phase={phase}
      progressPercent={percent}
      etaLabel={etaLabel}
    />
  );
}

function AnimatedDetailScene({
  phase,
  from,
  to,
  hint,
  durationMs = 4200,
}: {
  phase: MeetingProcessPhase;
  from: number;
  to: number;
  hint: string;
  durationMs?: number;
}) {
  return (
    <ReplayStage hint={hint} fill autoReplayMs={durationMs + 900}>
      {(play) => (
        <RisingDetailChrome
          play={play}
          phase={phase}
          from={from}
          to={to}
          durationMs={durationMs}
        />
      )}
    </ReplayStage>
  );
}

export function SceneMeetingTranscribing() {
  return (
    <AnimatedDetailScene
      phase="transcribing"
      from={1}
      to={71}
      hint="회의 상세 전체 화면, 받아쓰기 진행률."
      durationMs={5200}
    />
  );
}

export function SceneMeetingStructuring() {
  return (
    <AnimatedDetailScene
      phase="structuring"
      from={72}
      to={98}
      hint="회의 상세 전체 화면, 정리 진행률."
      durationMs={5600}
    />
  );
}

export function SceneMeetingError() {
  return (
    <ReplayStage
      hint="회의 상세 전체 화면, 실패 상태."
      fill
      autoReplayMs={3200}
    >
      {() => (
        <DetailChrome
          phase="error"
          error="보관함 파일을 찾을 수 없습니다."
        />
      )}
    </ReplayStage>
  );
}
