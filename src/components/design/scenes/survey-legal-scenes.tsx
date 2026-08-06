"use client";

import { useState } from "react";

import { PreviewStage } from "@/components/design/preview-stage";
import { DemandSurveyConsentGate } from "@/components/layout/demand-survey-consent-gate";
import { LegalDocsView } from "@/components/legal/legal-docs-view";
import { SurveyForm } from "@/components/survey/survey-form";
import { SURVEY_UNLOCKED_MONTHLY_MINUTES } from "@/lib/stt/survey";
import type { LegalDoc } from "@/lib/legal";

/** 창 크기는 DesignFrame 스테이지가 담당. */
function PageSceneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full min-h-full overflow-y-auto overscroll-y-contain bg-background">
      {children}
    </div>
  );
}

function SurveyPageShell({
  completed = false,
  children,
}: {
  completed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 sm:px-6">
      <header className="min-w-0 space-y-1.5">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
          {completed ? "설문 참여 완료" : "설문에 참여해 주세요"}
        </h1>
        <p className="text-base text-muted">
          {completed
            ? "소중한 의견 감사합니다. 다음 개선에 반영하겠습니다."
            : `1분이면 끝나는 짧은 설문입니다. 응답을 제출하면 이번 주기 잔여 시간이 최대 ${SURVEY_UNLOCKED_MONTHLY_MINUTES}분으로 늘어납니다.`}
        </p>
      </header>
      {children}
    </div>
  );
}

/** /survey 폼 */
export function SceneSurveyForm() {
  return (
    <PageSceneFrame>
      <SurveyPageShell>
        <SurveyForm preview />
      </SurveyPageShell>
    </PageSceneFrame>
  );
}

/** /survey 제출 완료 */
export function SceneSurveyCompleted() {
  return (
    <PageSceneFrame>
      <SurveyPageShell completed>
        <SurveyForm preview previewCompleted />
      </SurveyPageShell>
    </PageSceneFrame>
  );
}

/** 최초 진입 오픈 준비 기간 고지 */
export function SceneDemandSurveyConsent() {
  const [open, setOpen] = useState(true);
  return (
    <PreviewStage
      hint="가입 후 최초 진입 시 1회 고지."
      open={open}
      onReopen={() => setOpen(true)}
    >
      <DemandSurveyConsentGate
        preview
        forceOpen={open}
        contained
        onPreviewClose={() => setOpen(false)}
      />
    </PreviewStage>
  );
}

function LegalScene({ doc }: { doc: LegalDoc }) {
  return (
    <PageSceneFrame>
      <LegalDocsView doc={doc} />
    </PageSceneFrame>
  );
}

/** /privacy */
export function SceneLegalPrivacy() {
  return <LegalScene doc="privacy" />;
}

/** /terms */
export function SceneLegalTerms() {
  return <LegalScene doc="terms" />;
}

/** /policy */
export function SceneLegalPolicy() {
  return <LegalScene doc="policy" />;
}
