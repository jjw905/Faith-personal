"use client";

import { AudioUploadZone } from "@/components/dashboard/audio-upload-zone";
import { ProcessingNowSection } from "@/components/dashboard/processing-now";
import { ProcessingStatusPopup } from "@/components/dashboard/processing-status-popup";
import {
  FIXTURE_ACTIVITY_ACTIVE,
  FIXTURE_ACTIVITY_EMPTY,
  FIXTURE_ACTIVITY_ERROR,
  FIXTURE_PROCESSING_MULTI,
  FIXTURE_PROCESSING_STRUCTURING,
  FIXTURE_PROCESSING_TRANSCRIBING,
} from "@/components/design/fixtures";

function DashboardChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-full space-y-3 p-4 sm:p-6">
      <AudioUploadZone
        ctaStart="새 회의 시작"
        ctaUpload="파일 업로드"
      />
      {children}
    </div>
  );
}

/** 처리중 카드: 받아쓰는 중 */
export function SceneProcessingTranscribing() {
  return (
    <DashboardChrome>
      <ProcessingNowSection
        demoItems={FIXTURE_PROCESSING_TRANSCRIBING}
      />
    </DashboardChrome>
  );
}

/** 처리중 카드: 정리하는 중 */
export function SceneProcessingStructuring() {
  return (
    <DashboardChrome>
      <ProcessingNowSection
        demoItems={FIXTURE_PROCESSING_STRUCTURING}
      />
    </DashboardChrome>
  );
}

/** 처리중 카드: 여러 건 */
export function SceneProcessingMulti() {
  return (
    <DashboardChrome>
      <ProcessingNowSection demoItems={FIXTURE_PROCESSING_MULTI} />
    </DashboardChrome>
  );
}

/** 최근 활동 팝업: 진행 중 */
export function SceneActivityPopupActive() {
  return (
    <div className="flex h-full min-h-full items-start justify-end p-4 sm:p-6">
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
    <div className="flex h-full min-h-full items-start justify-end p-4 sm:p-6">
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
    <div className="flex h-full min-h-full items-start justify-end p-4 sm:p-6">
      <ProcessingStatusPopup demoItems={FIXTURE_ACTIVITY_EMPTY} forceOpen />
    </div>
  );
}
