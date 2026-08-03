"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";

import { FIXTURE_MEETING } from "@/components/design/fixtures";
import { ReplayStage } from "@/components/design/preview-stage";
import {
  MeetingProcessLoader,
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
  stageLabel,
}: {
  phase: MeetingProcessPhase;
  progressPercent?: number;
  error?: string | null;
  etaLabel?: string | null;
  stageLabel?: string | null;
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
            stageLabel={stageLabel}
          />
        </section>
      </div>
    </div>
  );
}

const TRANSCRIBE_STAGES = [
  "파일을 살펴보는 중이에요",
  "소리를 불러오는 중이에요",
  "받아쓰는 중이에요",
  "빠진 말을 다시 확인하는 중이에요",
  "말한 위치를 정밀하게 맞추는 중이에요",
] as const;

const STRUCTURE_STAGES = [
  "이야기의 흐름을 잡는 중이에요",
  "같은 목소리를 모으는 중이에요",
  "타임라인을 그리는 중이에요",
  "누가 말했는지 맞추는 중이에요",
  "표현을 다듬는 중이에요",
] as const;

function stageForPercent(phase: MeetingProcessPhase, percent: number) {
  if (phase === "structuring") {
    const t = Math.max(0, Math.min(1, (percent - 72) / 26));
    return STRUCTURE_STAGES[
      Math.min(STRUCTURE_STAGES.length - 1, Math.floor(t * STRUCTURE_STAGES.length))
    ]!;
  }
  const t = Math.max(0, Math.min(1, percent / 72));
  return TRANSCRIBE_STAGES[
    Math.min(TRANSCRIBE_STAGES.length - 1, Math.floor(t * TRANSCRIBE_STAGES.length))
  ]!;
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
  return (
    <DetailChrome
      phase={phase}
      progressPercent={percent}
      // 예측 ETA는 긴 분석에서 오차가 커 불안을 키우므로, 실제 경과 상태만 표시한다.
      etaLabel={null}
      stageLabel={stageForPercent(phase, percent)}
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
