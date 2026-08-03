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

function DashboardChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-full space-y-3 overflow-y-auto bg-background p-4 sm:p-6">
      <AudioUploadZone ctaStart="새 회의 시작" ctaUpload="파일 업로드" />
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
    <div className="h-full min-h-full space-y-3 overflow-y-auto bg-background p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {FLOW_STEPS.map(({ phase: step }) => (
          <span
            key={step}
            className={
              phase === step
                ? "rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground"
                : "rounded-full bg-surface-2 px-3 py-1 text-sm font-medium text-muted"
            }
          >
            {step === "panel"
              ? "패널"
              : step === "uploading"
                ? "업로드"
                : step === "ready"
                  ? "시작 대기"
                  : "시작 중"}
          </span>
        ))}
      </div>
      <AudioUploadZone
        ctaStart="새 회의 시작"
        ctaUpload="파일 업로드"
        demoPhase={phase}
      />
    </div>
  );
}

/** 올리기 → 업로드 → 시작 대기 → 시작 중. 한 번에 이어서 재생. */
export function SceneUploadStartFlow() {
  return (
    <ReplayStage
      hint="올리기 패널 → 업로드 → 시작 대기 → 시작 중. 재생으로 처음부터."
      fill
      autoReplayMs={7200}
    >
      {() => <UploadFlowDemo />}
    </ReplayStage>
  );
}

export function SceneUploadPanel() {
  return (
    <ReplayStage hint="파일 올리기 패널 열림." fill>
      {() => (
        <div className="h-full min-h-full overflow-y-auto bg-background p-4 sm:p-6">
          <AudioUploadZone demoPhase="panel" />
        </div>
      )}
    </ReplayStage>
  );
}

export function SceneUploadUploading() {
  return (
    <ReplayStage hint="업로드 중 스피너." fill autoReplayMs={3200}>
      {() => (
        <div className="h-full min-h-full overflow-y-auto bg-background p-4 sm:p-6">
          <AudioUploadZone demoPhase="uploading" />
        </div>
      )}
    </ReplayStage>
  );
}

export function SceneUploadStartReady() {
  return (
    <ReplayStage hint="파일 준비 완료, 시작 버튼." fill>
      {() => (
        <div className="h-full min-h-full overflow-y-auto bg-background p-4 sm:p-6">
          <AudioUploadZone demoPhase="ready" />
        </div>
      )}
    </ReplayStage>
  );
}

export function SceneUploadStarting() {
  return (
    <ReplayStage hint="시작 누른 직후, 시작 중…" fill autoReplayMs={3200}>
      {() => (
        <div className="h-full min-h-full overflow-y-auto bg-background p-4 sm:p-6">
          <AudioUploadZone demoPhase="starting" />
        </div>
      )}
    </ReplayStage>
  );
}

export function SceneUploadStartError() {
  return (
    <ReplayStage hint="시작 실패 메시지." fill>
      {() => (
        <div className="h-full min-h-full overflow-y-auto bg-background p-4 sm:p-6">
          <AudioUploadZone demoPhase="error" />
        </div>
      )}
    </ReplayStage>
  );
}

/** 처리중 카드: 받아쓰는 중 (대시보드 전체 + 진행 애니메이션) */
export function SceneProcessingTranscribing() {
  return (
    <ReplayStage
      hint="대시보드 전체, 받아쓰기 카드 진행."
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

/** 처리중 카드: 워커 대기 */
export function SceneProcessingWaiting() {
  return (
    <ReplayStage hint="대시보드 전체, 분석 대기(곧 시작)." fill>
      {() => (
        <DashboardChrome>
          <ProcessingNowSection demoItems={FIXTURE_PROCESSING_WAITING} />
        </DashboardChrome>
      )}
    </ReplayStage>
  );
}

/** 처리중 카드: 정리하는 중 */
export function SceneProcessingStructuring() {
  return (
    <ReplayStage
      hint="대시보드 전체, 정리 카드 진행."
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

/** 처리중 카드: 진행 1 + 대기 여러 건 */
export function SceneProcessingMulti() {
  return (
    <ReplayStage
      hint="대시보드 전체, 진행·대기 혼재."
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

/** 최근 활동 팝업: 진행 중 */
export function SceneActivityPopupActive() {
  return (
    <div className="flex h-full min-h-full items-start justify-end bg-background p-4 sm:p-6">
      <ProcessingStatusPopup
        demoItems={FIXTURE_ACTIVITY_ACTIVE}
        forceOpen
      />
    </div>
  );
}

/** 최근 활동 팝업: 실패 + 완료 */
export function SceneActivityPopupError() {
  return (
    <div className="flex h-full min-h-full items-start justify-end bg-background p-4 sm:p-6">
      <ProcessingStatusPopup
        demoItems={FIXTURE_ACTIVITY_ERROR}
        forceOpen
      />
    </div>
  );
}

/** 최근 활동 팝업: 비어 있음 */
export function SceneActivityPopupEmpty() {
  return (
    <div className="flex h-full min-h-full items-start justify-end bg-background p-4 sm:p-6">
      <ProcessingStatusPopup demoItems={FIXTURE_ACTIVITY_EMPTY} forceOpen />
    </div>
  );
}
