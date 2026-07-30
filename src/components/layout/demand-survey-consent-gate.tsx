"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { DEMAND_SURVEY_ACTIVE } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";

/**
 * 오픈 준비 기간 임시 보관·통계 목적 이용 고지. 가입 후 최초 진입 시
 * 1회만 노출하고 동의를 받는다. 개인정보 보호법상 수집 시점에 보유기간과
 * 파기 절차를 미리 알리면, 실제 파기 시점에 별도로 다시 통지할 의무는 없다
 * (제21조는 파기 의무만 규정하고 개별 통지를 요구하지 않음) — 그래서 이
 * 고지 화면과 정책 문서에 미리 못박아 둔다.
 */
export function DemandSurveyConsentGate({
  preview = false,
  forceOpen = false,
  contained = false,
  onPreviewClose,
}: {
  /** 디자인 랩: API 없이 고지 팝업만. */
  preview?: boolean;
  forceOpen?: boolean;
  /** 디자인 프레임 안에서 absolute 오버레이. */
  contained?: boolean;
  onPreviewClose?: () => void;
} = {}) {
  const { data: session, status: sessionStatus } = useSession();
  const [needsConsent, setNeedsConsent] = useState(preview && forceOpen);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (preview) {
      setNeedsConsent(forceOpen);
      return;
    }
    if (!DEMAND_SURVEY_ACTIVE) return;
    if (sessionStatus !== "authenticated" || !session?.user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/demand-survey-consent", {
          cache: "no-store",
        });
        const data = (await res.json()) as { ok?: boolean; consented?: boolean };
        if (!cancelled && data.ok && !data.consented) setNeedsConsent(true);
      } catch {
        // 조회 실패 시 강제로 막지 않음. 다음 진입에서 다시 시도.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, forceOpen, sessionStatus, session?.user?.id]);

  if ((!preview && !DEMAND_SURVEY_ACTIVE) || !needsConsent) return null;

  async function agree() {
    setSubmitting(true);
    try {
      if (!preview) {
        await fetch("/api/account/demand-survey-consent", { method: "POST" });
      }
    } finally {
      setNeedsConsent(false);
      setSubmitting(false);
      onPreviewClose?.();
    }
  }

  return (
    <div
      className={cn(
        "z-[100] flex items-center justify-center bg-black/50 px-4 py-6",
        contained ? "absolute inset-0" : "fixed inset-0",
      )}
    >
      <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-[0_8px_40px_rgba(17,22,46,0.25)] ring-1 ring-border">
        <p className="text-xl font-bold tracking-tight text-foreground">
          오픈 준비 기간 안내
        </p>
        <div className="mt-3 space-y-2.5 text-base leading-relaxed text-muted">
          <p>
            지금은 오픈을 준비하는 기간입니다. 업로드 분석 이용량과 설문
            응답은 통계 분석 목적으로만 임시 보관합니다.
          </p>
          <p>
            이 기간이 끝나면 계정과 연결된 값은 파기하고, 개인을 식별할 수
            없는 통계 결과만 남깁니다. 이 안내로 보유기간과 파기 절차를 미리
            알렸으므로 실제 파기 시점에 다시 통지하지 않습니다.
          </p>
          <p>
            자세한 내용은{" "}
            <Link href="/policy" className="font-semibold text-primary hover:underline">
              운영정책
            </Link>
            과{" "}
            <Link href="/privacy" className="font-semibold text-primary hover:underline">
              개인정보 처리방침
            </Link>
            에서 확인할 수 있습니다.
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          disabled={submitting}
          onClick={() => void agree()}
          className="mt-5 h-14 w-full rounded-xl text-base font-semibold"
        >
          동의하고 시작
        </Button>
      </div>
    </div>
  );
}
