"use client";

import { useEffect, useState } from "react";

import {
  AudioUploadZone,
  type AudioUploadDemoPhase,
} from "@/components/dashboard/audio-upload-zone";
import { ProcessingNowSection } from "@/components/dashboard/processing-now";
import { ProcessingStatusPopup } from "@/components/dashboard/processing-status-popup";
import {
  FIXTURE_ACTIVITY_ACTIVE,
  FIXTURE_ACTIVITY_EMPTY,
  FIXTURE_ACTIVITY_ERROR,
  FIXTURE_PROCESSING_MULTI,
  FIXTURE_PROCESSING_STRUCTURING,
  FIXTURE_PROCESSING_TRANSCRIBING,
  FIXTURE_PROCESSING_WAITING,
} from "@/components/design/fixtures";
import { ReplayStage } from "@/components/design/preview-stage";
import { MeetingRecordChrome } from "@/components/meetings/meeting-record-layout";
import { formatSeoulDateParts } from "@/lib/meeting-date";

function CreatePageShell({
  demoPhase,
}: {
  demoPhase?: AudioUploadDemoPhase | null;
}) {
  const nowIso = new Date().toISOString();
  const { day, time } = formatSeoulDateParts(nowIso);
  const headerLabel = `${day} · ${time}`;

  return (
    <div className="h-full min-h-full overflow-y-auto bg-white px-4 pt-1 sm:px-6 sm:pt-2">
      <MeetingRecordChrome
        back={
          <span className="-ml-2 mb-3 inline-flex h-9 items-center gap-1.5 px-2 text-sm font-semibold text-muted">
            돌아가기
          </span>
        }
        headerCenter={
          <time className="block truncate text-center text-xl font-bold tabular-nums tracking-tight text-foreground">
            {headerLabel}
          </time>
        }
        title={
          <>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              회의록 생성
            </h1>
            <p className="mt-3 text-base text-muted">
              잔여 120분
              <span className="mx-2 text-muted-2" aria-hidden>
                ·
              </span>
              <span className="font-semibold text-primary">설문하고 60분 받기</span>
            </p>
          </>
        }
      >
        <div className="mt-5 space-y-5 pb-8">
          <AudioUploadZone
            hideCtas
            alwaysOpen
            hidePanelClose
            showRecord
            flat
            hideQuotaBanner
            demoPhase={demoPhase ?? "panel"}
          />
        </div>
      </MeetingRecordChrome>
    </div>
  );
}

function DashboardChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-full space-y-3 overflow-y-auto bg-background p-4 sm:p-6">
      {children}
    </div>
  );
}

const FLOW_STEPS: Array<{ phase: AudioUploadDemoPhase; atMs: number }> = [
  { phase: "panel", atMs: 0 },
  { phase: "uploading", atMs: 1100 },
  { phase: "ready", atMs: 2800 },
  { phase: "starting", atMs: 4300 },
];

const RECORD_FLOW_STEPS: Array<{ phase: AudioUploadDemoPhase; atMs: number }> = [
  { phase: "panel", atMs: 0 },
  { phase: "recording", atMs: 700 },
  { phase: "ready", atMs: 3200 },
];

function UploadFlowDemo() {
  const [phase, setPhase] = useState<AudioUploadDemoPhase>("panel");

  useEffect(() => {
    const timers = FLOW_STEPS.slice(1).map(({ phase: next, atMs }) =>
      window.setTimeout(() => setPhase(next), atMs),
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, []);

  return (
    <div className="relative h-full min-h-full">
      <div className="pointer-events-none absolute left-4 right-4 top-2 z-10 flex flex-wrap justify-center gap-2 sm:left-6 sm:right-6">
        {FLOW_STEPS.map(({ phase: step }) => (
          <span
            key={step}
            className={
              phase === step
                ? "rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground shadow-soft"
                : "rounded-full bg-card/90 px-3 py-1 text-sm font-medium text-muted ring-1 ring-border backdrop-blur-sm"
            }
          >
            {step === "panel"
              ? "선택"
              : step === "uploading"
                ? "업로드"
                : step === "ready"
                  ? "시작 대기"
                  : "시작 중"}
          </span>
        ))}
      </div>
      <CreatePageShell demoPhase={phase} />
    </div>
  );
}

function RecordExpandFlowDemo() {
  const [phase, setPhase] = useState<AudioUploadDemoPhase>("panel");

  useEffect(() => {
    const timers = RECORD_FLOW_STEPS.slice(1).map(({ phase: next, atMs }) =>
      window.setTimeout(() => setPhase(next), atMs),
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
  }, []);

  return (
    <div className="relative h-full min-h-full">
      <div className="pointer-events-none absolute left-4 right-4 top-2 z-10 flex flex-wrap justify-center gap-2 sm:left-6 sm:right-6">
        {RECORD_FLOW_STEPS.map(({ phase: step }) => (
          <span
            key={step}
            className={
              phase === step
                ? "rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground shadow-soft"
                : "rounded-full bg-card/90 px-3 py-1 text-sm font-medium text-muted ring-1 ring-border backdrop-blur-sm"
            }
          >
            {step === "panel"
              ? "선택"
              : step === "recording"
                ? "녹음 펼침"
                : "시작 대기"}
          </span>
        ))}
      </div>
      <CreatePageShell demoPhase={phase} />
    </div>
  );
}

/** 회의록 생성: 선택 → 업로드 → 시작 대기 → 시작 중 */
export function SceneUploadStartFlow() {
  return (
    <ReplayStage
      hint="회의록 생성 화면. 선택 → 업로드 → 시작 대기 → 시작 중."
      fill
      autoReplayMs={7200}
    >
      {() => <UploadFlowDemo />}
    </ReplayStage>
  );
}

/** 회의록 생성: 녹음 눌러 펼침 → 중지 후 시작 대기 */
export function SceneRecordExpandFlow() {
  return (
    <ReplayStage
      hint="추가 후 녹음 — 업로드·보관함이 접히고 녹음 패널이 펼쳐짐."
      fill
      autoReplayMs={5600}
    >
      {() => <RecordExpandFlowDemo />}
    </ReplayStage>
  );
}

export function SceneUploadPanel() {
  return (
    <ReplayStage hint="회의록 생성 — 업로드·보관함·녹음." fill>
      {() => <CreatePageShell demoPhase="panel" />}
    </ReplayStage>
  );
}

export function SceneUploadRecording() {
  return (
    <ReplayStage hint="녹음 중 — 비트·타이머·중지." fill autoReplayMs={4000}>
      {() => <CreatePageShell demoPhase="recording" />}
    </ReplayStage>
  );
}

export function SceneUploadUploading() {
  return (
    <ReplayStage hint="업로드 중." fill autoReplayMs={3200}>
      {() => <CreatePageShell demoPhase="uploading" />}
    </ReplayStage>
  );
}

export function SceneUploadStartReady() {
  return (
    <ReplayStage hint="파일 준비 완료, 회의 정리 시작." fill>
      {() => <CreatePageShell demoPhase="ready" />}
    </ReplayStage>
  );
}

export function SceneUploadStarting() {
  return (
    <ReplayStage hint="시작 중…" fill autoReplayMs={3200}>
      {() => <CreatePageShell demoPhase="starting" />}
    </ReplayStage>
  );
}

export function SceneUploadStartError() {
  return (
    <ReplayStage hint="시작 실패 메시지." fill>
      {() => <CreatePageShell demoPhase="error" />}
    </ReplayStage>
  );
}

/** 기록 목록에 붙는 분석 중 행(디자인 랩 카드) */
export function SceneProcessingTranscribing() {
  return (
    <ReplayStage
      hint="기록 목록, 받아쓰는 중."
      fill
      autoReplayMs={5600}
    >
      {() => (
        <DashboardChrome>
          <ProcessingNowSection
            demoItems={FIXTURE_PROCESSING_TRANSCRIBING}
            animateDemo
          />
        </DashboardChrome>
      )}
    </ReplayStage>
  );
}

export function SceneProcessingWaiting() {
  return (
    <ReplayStage hint="기록 목록, 분석 대기." fill>
      {() => (
        <DashboardChrome>
          <ProcessingNowSection demoItems={FIXTURE_PROCESSING_WAITING} />
        </DashboardChrome>
      )}
    </ReplayStage>
  );
}

export function SceneProcessingStructuring() {
  return (
    <ReplayStage
      hint="기록 목록, 정리하는 중."
      fill
      autoReplayMs={5600}
    >
      {() => (
        <DashboardChrome>
          <ProcessingNowSection
            demoItems={FIXTURE_PROCESSING_STRUCTURING}
            animateDemo
          />
        </DashboardChrome>
      )}
    </ReplayStage>
  );
}

export function SceneProcessingMulti() {
  return (
    <ReplayStage
      hint="기록 목록 상단. 진행 → 대기 빠른순."
      fill
      autoReplayMs={5600}
    >
      {() => (
        <DashboardChrome>
          <ProcessingNowSection
            demoItems={FIXTURE_PROCESSING_MULTI}
            animateDemo
          />
        </DashboardChrome>
      )}
    </ReplayStage>
  );
}

export function SceneActivityPopupActive() {
  return (
    <ReplayStage hint="최근 활동 팝업, 진행 중." fill>
      {() => (
        <div className="relative flex h-full min-h-[28rem] justify-end bg-background p-6">
          <ProcessingStatusPopup
            forceOpen
            demoItems={FIXTURE_ACTIVITY_ACTIVE}
          />
        </div>
      )}
    </ReplayStage>
  );
}

export function SceneActivityPopupError() {
  return (
    <ReplayStage hint="최근 활동 팝업, 실패." fill>
      {() => (
        <div className="relative flex h-full min-h-[28rem] justify-end bg-background p-6">
          <ProcessingStatusPopup
            forceOpen
            demoItems={FIXTURE_ACTIVITY_ERROR}
          />
        </div>
      )}
    </ReplayStage>
  );
}

export function SceneActivityPopupEmpty() {
  return (
    <ReplayStage hint="최근 활동 팝업, 비어 있음." fill>
      {() => (
        <div className="relative flex h-full min-h-[28rem] justify-end bg-background p-6">
          <ProcessingStatusPopup
            forceOpen
            demoItems={FIXTURE_ACTIVITY_EMPTY}
          />
        </div>
      )}
    </ReplayStage>
  );
}
