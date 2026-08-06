"use client";

import { useEffect, useState } from "react";

import type { AudioUploadDemoPhase } from "@/components/dashboard/audio-upload-zone";
import { ReplayStage } from "@/components/design/preview-stage";
import { MeetingCreatePage } from "@/components/meetings/meeting-create-page";

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
      <MeetingCreatePage demoPhase={phase} />
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
      <MeetingCreatePage demoPhase={phase} />
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
      {() => <MeetingCreatePage demoPhase="panel" />}
    </ReplayStage>
  );
}

export function SceneUploadRecording() {
  return (
    <ReplayStage hint="녹음 중 — 비트·타이머·중지." fill autoReplayMs={4000}>
      {() => <MeetingCreatePage demoPhase="recording" />}
    </ReplayStage>
  );
}

export function SceneUploadUploading() {
  return (
    <ReplayStage hint="업로드 중." fill autoReplayMs={3200}>
      {() => <MeetingCreatePage demoPhase="uploading" />}
    </ReplayStage>
  );
}

export function SceneUploadStartReady() {
  return (
    <ReplayStage hint="파일 준비 완료, 회의 정리 시작." fill>
      {() => <MeetingCreatePage demoPhase="ready" />}
    </ReplayStage>
  );
}

export function SceneUploadStarting() {
  return (
    <ReplayStage hint="시작 중…" fill autoReplayMs={3200}>
      {() => <MeetingCreatePage demoPhase="starting" />}
    </ReplayStage>
  );
}

export function SceneUploadStartError() {
  return (
    <ReplayStage hint="시작 실패 메시지." fill>
      {() => <MeetingCreatePage demoPhase="error" />}
    </ReplayStage>
  );
}
