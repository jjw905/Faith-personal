"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Gift } from "lucide-react";

import { AudioUploadZone, type AudioUploadDemoPhase } from "@/components/dashboard/audio-upload-zone";
import {
  MeetingRecordLayout,
  MeetingRecordPortal,
} from "@/components/meetings/meeting-record-layout";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  formatQuotaRemainingLabel,
  formatSurveyCta,
  monthlyMinutesFromSeconds,
} from "@/lib/usage-copy";
import type { UsageLimitTimeStatus } from "@/components/dashboard/usage-limit-dialog";

function demoPhaseFromScenario(scenarioId: string): AudioUploadDemoPhase | null {
  switch (scenarioId) {
    case "popup-uploading":
      return "uploading";
    case "popup-recording":
      return "recording";
    case "popup-start-ready":
      return "ready";
    case "popup-starting":
      return "starting";
    case "popup-start-error":
      return "error";
    case "popup-duplicate":
    case "popup-vault-picker":
    case "popup-vault-picker-loading":
    case "popup-vault-picker-empty":
      return "panel";
    case "anim-upload-flow":
    case "anim-record-expand":
      return null;
    default:
      return null;
  }
}

/** 상세의 키워드 줄과 같은 자리 — 제목 아래 작은 설문·잔여. */
function CreateSurveyHint() {
  const { isLive } = usePageUxPreview();
  const [status, setStatus] = useState<UsageLimitTimeStatus | null>(null);

  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/usage/quota", { cache: "no-store" });
        const data = (await res.json()) as UsageLimitTimeStatus & {
          ok?: boolean;
        };
        if (!cancelled && data.ok && data.enforced !== false) setStatus(data);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLive]);

  if (!isLive || !status) return null;

  const monthlyLimitSec = status.monthlyLimitSec ?? status.limitSec;
  const monthlyLimitMin = monthlyMinutesFromSeconds(monthlyLimitSec);
  const remainingLabel = formatQuotaRemainingLabel(
    status.remainingSec,
    monthlyLimitSec,
  );

  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-muted">
      <span className="tabular-nums">{remainingLabel}</span>
      {!status.surveyCompleted ? (
        <>
          <span className="text-muted-2" aria-hidden>
            ·
          </span>
          <Link
            href="/survey"
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            <Gift className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            {formatSurveyCta(monthlyLimitMin)}
          </Link>
        </>
      ) : null}
    </p>
  );
}

/** 일자 슬롯은 비움 — 데스크톱만 행 높이 맞춤. 모바일은 투명 슬롯이 제목을 아래로 밀지 않게 숨김. */
const EMPTY_HEADER_CENTER = (
  <span
    className="hidden truncate text-center text-xl font-bold tabular-nums tracking-tight text-foreground opacity-0 md:block md:text-xl"
    aria-hidden
  >
    —
  </span>
);

function CreateTitle() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        회의록 생성
      </h1>
      <CreateSurveyHint />
    </>
  );
}

function CreateUploadBody({
  demoPhase: demoPhaseOverride,
}: {
  /** 디자인 랩 등 — 페이지 UX 시나리오 대신 단계 고정 */
  demoPhase?: AudioUploadDemoPhase | null;
} = {}) {
  const { scenarioId } = usePageUxPreview();
  const demoPhase =
    demoPhaseOverride !== undefined
      ? demoPhaseOverride
      : demoPhaseFromScenario(scenarioId);

  return (
    <AudioUploadZone
      hideCtas
      alwaysOpen
      hidePanelClose
      showRecord
      flat
      hideQuotaBanner
      demoPhase={demoPhase}
    />
  );
}

/**
 * 사이드바·딥링크용 페이지. 기록 상세와 동일 프레임, 일자 없음.
 * `demoPhase`는 디자인 랩 미리보기용.
 */
export function MeetingCreatePage({
  demoPhase,
}: {
  demoPhase?: AudioUploadDemoPhase | null;
} = {}) {
  return (
    <MeetingRecordLayout
      backAlwaysVisible
      headerCenter={EMPTY_HEADER_CENTER}
      title={<CreateTitle />}
    >
      <div className="mt-5 space-y-5 pb-[calc(env(safe-area-inset-bottom,0px)+6.25rem)] md:pb-0">
        <CreateUploadBody demoPhase={demoPhase} />
      </div>
    </MeetingRecordLayout>
  );
}

/**
 * 대시보드 「회의록 생성」 — 일정/기록 클릭 때와 같은 전면 포털.
 */
export function MeetingCreatePanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <MeetingRecordPortal
      open={open}
      ariaLabel="회의록 생성"
      onBack={onClose}
      headerCenter={EMPTY_HEADER_CENTER}
      title={<CreateTitle />}
    >
      <CreateUploadBody />
    </MeetingRecordPortal>
  );
}
