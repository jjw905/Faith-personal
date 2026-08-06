"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { UsageLimitDialog } from "@/components/dashboard/usage-limit-dialog";
import {
  MEETING_PROCESS_LABEL,
  friendlyProcessStageLabel,
  userFacingAnalysisError,
  type MeetingProcessPhase,
} from "@/lib/meeting-process";
import { nextDisplayPercent } from "@/lib/meeting-process-progress";
import { cn } from "@/lib/utils";

export type { MeetingProcessPhase };
export { MEETING_PROCESS_LABEL, friendlyProcessStageLabel };
export { displayCreepCeiling } from "@/lib/meeting-process-progress";

function isQuotaBlockedMessage(message: string | null | undefined) {
  if (!message) return false;
  return (
    message.includes("분석 가능 시간") ||
    message.includes("무료 분석 시간") ||
    message.includes("잔여 시간이 없습니다") ||
    message.includes("설문에 참여하면")
  );
}

const MIN_VISIBLE_PROGRESS = 1;

function monotonicNow() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clampPercent(n: unknown, phase: MeetingProcessPhase): number {
  if (typeof n === "number" && Number.isFinite(n)) {
    const minimum = phase === "transcribing" || phase === "structuring"
      ? MIN_VISIBLE_PROGRESS
      : 0;
    return Math.max(minimum, Math.min(100, Math.round(n)));
  }
  if (phase === "structuring") return 72;
  if (phase === "transcribing") return MIN_VISIBLE_PROGRESS;
  if (phase === "done") return 100;
  return 0;
}

/** "받아쓰는 중 (2/5)" → 애니메이션 키는 괄호 앞부분만 본다. 카운트만 바뀌어도 다시 튀지 않게. */
function stageAnimationKey(label: string) {
  return label.replace(/\s*\([^)]*\)\s*$/, "");
}

export function formatElapsedStatus(
  elapsedSec: number,
  activityState?: "waiting" | "active" | "checking" | "idle" | null,
): string | null {
  if (!Number.isFinite(elapsedSec) || elapsedSec < 0) return null;
  if (activityState === "waiting") return "잠시 준비하고 있어요";
  const minutes = Math.max(1, Math.floor(elapsedSec / 60));
  if (elapsedSec < 60) return "처리를 시작했어요";
  if (activityState === "checking") {
    return `${minutes}분째 진행 중 · 다음 단계로 넘어갈 준비를 하고 있어요`;
  }
  if (minutes >= 10 && activityState === "active") {
    return `${minutes}분째 진행 중 · 조금만 더 기다려 주세요`;
  }
  return `${minutes}분째 처리 중`;
}

/** 채워지는 선형 게이지. 돌아가는 링은 쓰지 않는다. */
function ProcessProgressBar({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const label = Math.round(clamped);

  return (
    <div
      className={cn("w-full max-w-lg", className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={label}
    >
      {/* 숫자+%를 한 덩어리로 가운데 — 막대 왼쪽 붙음(좌측 치우침) 방지 */}
      <p className="mb-3 flex w-full items-baseline justify-center gap-0.5 tabular-nums text-[clamp(1.75rem,7vw,2.25rem)] font-semibold leading-none tracking-tight text-primary">
        <span className="inline-block min-w-[2.5ch] text-center">{label}</span>
        <span className="text-[0.55em] font-semibold leading-none">%</span>
      </p>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

/** 진행률 + 문구. 디자인 랩·상세 공용. */
export function MeetingProcessLoader({
  phase,
  error,
  progressPercent,
  stageLabel,
  etaLabel,
  onCancel,
  cancelPending,
  className,
}: {
  phase: MeetingProcessPhase;
  error?: string | null;
  progressPercent?: number;
  /** "받아쓰는 중", "분석하는 중" 등 세부 단계. 없으면 phase 기본 문구. */
  stageLabel?: string | null;
  /** 실제 경과 상태를 보조하는 문구. 예측 완료 시각은 표시하지 않는다. */
  etaLabel?: string | null;
  onCancel?: () => void;
  cancelPending?: boolean;
  className?: string;
}) {
  const active = phase === "transcribing" || phase === "structuring";
  const percentRaw =
    typeof progressPercent === "number" && Number.isFinite(progressPercent)
      ? Math.max(active ? MIN_VISIBLE_PROGRESS : 0, Math.min(100, progressPercent))
      : clampPercent(progressPercent, phase);
  const percentLabel = Math.round(percentRaw);
  const rawLabel =
    (active && stageLabel?.trim()) || MEETING_PROCESS_LABEL[phase];
  const label = friendlyProcessStageLabel(rawLabel);

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 px-4 py-10",
        className,
      )}
      aria-live="polite"
      aria-busy={active}
      aria-label={
        active
          ? `${label}, ${percentLabel}퍼센트`
          : label
      }
    >
      {active ? <ProcessProgressBar percent={percentRaw} /> : null}

      <div className="relative mx-auto flex h-7 w-full max-w-[min(22rem,90vw)] items-center justify-center overflow-hidden">
        <p
          key={stageAnimationKey(label)}
          className={cn(
            "w-full truncate text-center text-base font-semibold tracking-tight text-foreground",
            "motion-safe:animate-[process-rise_0.55s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none",
            phase === "error" && "text-masked",
          )}
        >
          {label}
        </p>
      </div>

      {active && etaLabel ? (
        <p className="text-center text-base text-muted">{etaLabel}</p>
      ) : null}

      {active && onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelPending}
          className="min-h-11 rounded-xl px-4 text-base font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground disabled:cursor-wait disabled:opacity-60"
        >
          {cancelPending ? "취소하는 중이에요" : "분석 취소"}
        </button>
      ) : null}

      {(phase === "error" || phase === "empty") && error ? (
        <p className="max-w-xs text-center text-base leading-relaxed text-muted">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** 업로드 STT 처리 중 폴링. 완료 시 새로고침. */
export function MeetingProcessBanner({
  meetingId,
  initialPhase,
  initialProgressPercent,
  initialErrorMessage,
  initialStageLabel,
}: {
  meetingId: string;
  initialPhase: MeetingProcessPhase;
  initialProgressPercent?: number;
  initialErrorMessage?: string | null;
  initialStageLabel?: string | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<MeetingProcessPhase>(initialPhase);
  const [stageLabel, setStageLabel] = useState<string | null>(
    initialStageLabel ?? null,
  );
  const [etaLabel, setEtaLabel] = useState<string | null>(null);
  const [canCancel, setCanCancel] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    initialPhase === "error" || initialPhase === "empty"
      ? (userFacingAnalysisError(initialErrorMessage) || MEETING_PROCESS_LABEL[initialPhase])
      : null,
  );
  const [usageDialogOpen, setUsageDialogOpen] = useState(() =>
    isQuotaBlockedMessage(initialErrorMessage),
  );

  const active = phase === "transcribing" || phase === "structuring";

  const initialPercent = clampPercent(initialProgressPercent, initialPhase);
  const [displayPercent, setDisplayPercent] = useState(initialPercent);
  const targetPercentRef = useRef(initialPercent);
  const targetRaisedAtRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef(0);

  // 서버 값은 1초 폴링. 화면은 프레임마다 실측 target을 따라간다.
  useEffect(() => {
    if (!active) {
      return;
    }
    if (targetRaisedAtRef.current == null) {
      targetRaisedAtRef.current = monotonicNow();
    }
    let raf = 0;
    lastFrameAtRef.current = 0;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const step = (now: number) => {
      const prevAt = lastFrameAtRef.current || now;
      lastFrameAtRef.current = now;
      const dtMs = now - prevAt;
      const stalledMs = Math.max(
        0,
        now - (targetRaisedAtRef.current ?? now),
      );

      setDisplayPercent((cur) => {
        const target = targetPercentRef.current;
        if (reduceMotion) {
          return Math.max(cur, Math.min(100, target));
        }
        return nextDisplayPercent({
          current: cur,
          target,
          stalledMs,
          nowMs: now,
          dtMs,
        });
      });
      raf = window.requestAnimationFrame(step);
    };
    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, [active]);

  useEffect(() => {
    if (phase === "done") return;
    if (phase === "error" || phase === "empty") return;

    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/meetings/${meetingId}/status`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          phase?: MeetingProcessPhase;
          progressPercent?: number;
          errorMessage?: string | null;
          stageLabel?: string | null;
          elapsedSec?: number;
          activityState?: "waiting" | "active" | "checking" | "idle";
          canCancel?: boolean;
          cancelPending?: boolean;
        };
        if (cancelled || !data.ok || !data.phase) return;

        const nextPercent = clampPercent(data.progressPercent, data.phase);
        setPhase(data.phase);
        setStageLabel(data.stageLabel ?? null);
        setCanCancel(Boolean(data.canCancel));
        setCancelPending(Boolean(data.cancelPending));
        setEtaLabel(
          formatElapsedStatus(
            typeof data.elapsedSec === "number" ? data.elapsedSec : 0,
            data.activityState,
          ),
        );
        if (nextPercent > targetPercentRef.current + 0.05) {
          targetRaisedAtRef.current = monotonicNow();
        }
        targetPercentRef.current = Math.max(
          targetPercentRef.current,
          nextPercent,
        );

        if (data.phase === "error" || data.phase === "empty") {
          const nextError = userFacingAnalysisError(
            data.errorMessage ?? MEETING_PROCESS_LABEL[data.phase],
          );
          setError(nextError);
          if (isQuotaBlockedMessage(nextError)) setUsageDialogOpen(true);
          setEtaLabel(null);
          return;
        }
        if (data.phase === "done") {
          setDisplayPercent(100);
          setEtaLabel(null);
          router.refresh();
          return;
        }

      } catch {
        // retry next interval
      }
    };

    void tick();
    const id = window.setInterval(() => void tick(), 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [meetingId, phase, router]);

  if (phase === "done") return null;

  const cancel = async () => {
    if (!canCancel || cancelPending) return;
    if (!window.confirm("분석을 취소할까요? 이미 시작된 분석은 사용 시간이 차감될 수 있습니다.")) {
      return;
    }
    setCancelPending(true);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/analysis-cancel`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        ok?: boolean;
        cancelPending?: boolean;
        message?: string;
      };
      if (!response.ok || !data.ok) {
        setCancelPending(false);
        setError(data.message ?? "취소 요청을 처리하지 못했습니다.");
        return;
      }
      setCancelPending(Boolean(data.cancelPending));
      setStageLabel(
        data.cancelPending
          ? "취소하는 중이에요"
          : "분석을 취소했습니다",
      );
    } catch {
      setCancelPending(false);
      setError("취소 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <section
      className={cn(
        "flex flex-col items-center justify-center",
        active ? "flex-1" : "min-h-[min(40vh,22rem)]",
      )}
    >
      <MeetingProcessLoader
        phase={phase}
        error={error}
        progressPercent={displayPercent}
        stageLabel={stageLabel}
        etaLabel={etaLabel}
        onCancel={canCancel ? () => void cancel() : undefined}
        cancelPending={cancelPending}
      />
      <UsageLimitDialog
        open={usageDialogOpen}
        variant="time"
        onClose={() => setUsageDialogOpen(false)}
      />
    </section>
  );
}
