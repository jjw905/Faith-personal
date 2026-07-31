"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { UsageLimitDialog } from "@/components/dashboard/usage-limit-dialog";
import {
  MEETING_PROCESS_LABEL,
  type MeetingProcessPhase,
} from "@/lib/meeting-process";
import { nextDisplayPercent } from "@/lib/meeting-process-progress";
import { cn } from "@/lib/utils";

export type { MeetingProcessPhase };
export { MEETING_PROCESS_LABEL };
export { displayCreepCeiling } from "@/lib/meeting-process-progress";

function isQuotaBlockedMessage(message: string | null | undefined) {
  if (!message) return false;
  return (
    message.includes("분석 가능 시간") ||
    message.includes("무료 분석 시간") ||
    message.includes("설문에 참여하면")
  );
}

/** ETA 계산용 최소 신호. 너무 이르면 튀는 추정치라 숨긴다. (MS Progress Bars) */
const ETA_MIN_ELAPSED_SEC = 3;
const ETA_MIN_PERCENT_GAIN = 1.5;
const ETA_MAX_REMAINING_SEC = 60 * 60;
/** tqdm 기본과 같이 최근 속도에 가중. 0=전체평균, 1=순간속도 */
const ETA_RATE_SMOOTH = 0.3;
/** 남은 시간이 갑자기 늘지 않게 상한 배율 */
const ETA_UPWARD_CAP = 1.25;

function clampPercent(n: unknown, phase: MeetingProcessPhase): number {
  if (typeof n === "number" && Number.isFinite(n)) {
    return Math.max(0, Math.min(100, Math.round(n)));
  }
  if (phase === "structuring") return 72;
  if (phase === "transcribing") return 0;
  if (phase === "done") return 100;
  return 0;
}

/** "받아쓰는 중 (2/5)" → 애니메이션 키는 괄호 앞부분만 본다. 카운트만 바뀌어도 다시 튀지 않게. */
function stageAnimationKey(label: string) {
  return label.replace(/\s*\([^)]*\)\s*$/, "");
}

/** 진행 중 문구를 사용자용으로 부드럽게. 예전 딱딱한 표기도 흡수한다. */
export function friendlyProcessStageLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/보완/.test(t)) return "추가 보완중이예요";
  const stripped = t
    .replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
  if (stripped === "분석하는 중" || stripped.startsWith("분석하는 중")) {
    return "이야기의 흐름을 잡는 중이에요";
  }
  if (stripped === "받아쓰는 중") return "받아쓰는 중이에요";
  if (stripped === "정리하는 중") return "정리하는 중이에요";
  if (stripped === "파일 확인하는 중") return "파일을 살펴보는 중이에요";
  if (stripped === "오디오 불러오는 중") return "소리를 불러오는 중이에요";
  if (stripped === "타임라인 작성하는 중") return "타임라인을 그리는 중이에요";
  if (stripped === "화자 확인하는 중") return "누가 말했는지 맞추는 중이에요";
  if (stripped === "표현 다듬는 중") return "표현을 다듬는 중이에요";
  return stripped;
}

/**
 * 남은 시간축 문구. 절대 시각(18:53)이 아니라 상대 잔여.
 * MS Progress Bars: 가장 큰 단위 위주, 거짓 정밀도(초 나열) 금지.
 */
export function formatEtaLabel(remainingSec: number): string | null {
  if (!Number.isFinite(remainingSec) || remainingSec <= 0) return null;
  if (remainingSec > ETA_MAX_REMAINING_SEC) return null;

  if (remainingSec < 45) return "잠시 후 완료";

  const minutes = Math.max(1, Math.round(remainingSec / 60));
  if (minutes < 60) return `${minutes}분 남음`;

  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (remMin === 0) return `${hours}시간 남음`;
  return `${hours}시간 ${remMin}분 남음`;
}

/** 단위 테스트·검증용: 진행률 속도로 남은 초 추정. */
export function estimateRemainingSec(params: {
  percent: number;
  percentPerSec: number;
}): number | null {
  const { percent, percentPerSec } = params;
  if (
    !Number.isFinite(percent) ||
    !Number.isFinite(percentPerSec) ||
    percentPerSec <= 0 ||
    percent >= 100
  ) {
    return null;
  }
  const remaining = Math.max(0, 100 - percent) / percentPerSec;
  if (!Number.isFinite(remaining) || remaining > ETA_MAX_REMAINING_SEC) {
    return null;
  }
  return remaining;
}

/** M3 원형 진행. viewBox 고정으로 크기만 바꿔도 비율 유지. */
function ProcessProgressRing({
  percent,
  className,
}: {
  percent: number;
  className?: string;
}) {
  const size = 120;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, percent)) / 100);

  return (
    <div
      className={cn(
        "relative aspect-square size-[min(7.5rem,42vw)] shrink-0 overflow-hidden",
        className,
      )}
      aria-hidden
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="block h-full w-full -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-surface-2"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="text-primary transition-[stroke-dashoffset] duration-75 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="tabular-nums text-[clamp(1.25rem,5vw,1.75rem)] font-semibold tracking-tight text-primary">
          {Math.round(percent)}
          <span className="text-[0.55em] font-semibold">%</span>
        </span>
      </span>
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
  className,
}: {
  phase: MeetingProcessPhase;
  error?: string | null;
  progressPercent?: number;
  /** "받아쓰는 중", "분석하는 중" 등 세부 단계. 없으면 phase 기본 문구. */
  stageLabel?: string | null;
  /** "5분 남음" 같은 남은 시간 문구. */
  etaLabel?: string | null;
  className?: string;
}) {
  const active = phase === "transcribing" || phase === "structuring";
  const percentRaw =
    typeof progressPercent === "number" && Number.isFinite(progressPercent)
      ? Math.max(0, Math.min(100, progressPercent))
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
      aria-label={active ? `${label}, ${percentLabel}퍼센트` : label}
    >
      {active ? <ProcessProgressRing percent={percentRaw} /> : null}

      <div className="relative h-6 overflow-hidden md:h-5">
        <p
          key={stageAnimationKey(label)}
          className={cn(
            "text-center text-base font-semibold tracking-tight text-foreground md:text-sm",
            "animate-[process-rise_0.55s_cubic-bezier(0.22,1,0.36,1)_both]",
            phase === "error" && "text-masked",
          )}
        >
          {label}
        </p>
      </div>

      {active && etaLabel ? (
        <p className="text-center text-base text-muted md:text-sm">
          {etaLabel}
        </p>
      ) : null}

      {(phase === "error" || phase === "empty") && error ? (
        <p className="max-w-xs text-center text-base leading-relaxed text-muted md:text-sm">
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
  const [error, setError] = useState<string | null>(() =>
    initialPhase === "error" || initialPhase === "empty"
      ? (initialErrorMessage?.trim() || MEETING_PROCESS_LABEL[initialPhase])
      : null,
  );
  const [usageDialogOpen, setUsageDialogOpen] = useState(() =>
    isQuotaBlockedMessage(initialErrorMessage),
  );

  const active = phase === "transcribing" || phase === "structuring";

  const initialPercent = clampPercent(initialProgressPercent, initialPhase);
  const [displayPercent, setDisplayPercent] = useState(initialPercent);
  const targetPercentRef = useRef(initialPercent);
  const targetRaisedAtRef = useRef(
    typeof performance !== "undefined" ? performance.now() : Date.now(),
  );
  const lastFrameAtRef = useRef(0);
  const etaRef = useRef<{
    lastSample: { time: number; percent: number } | null;
    rate: number | null;
    remainingSec: number | null;
  }>({ lastSample: null, rate: null, remainingSec: null });

  // 서버 값은 1초 폴링. 화면은 프레임마다 따라가며, target이 멈춰도
  // 단계 밴드 안에서는 천천히 더 올라간다 (옛 77% 영구 정지 방지).
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    lastFrameAtRef.current = 0;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const step = (now: number) => {
      const prevAt = lastFrameAtRef.current || now;
      lastFrameAtRef.current = now;
      const dtMs = now - prevAt;
      const stalledMs = Math.max(0, now - targetRaisedAtRef.current);

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

  // 남은 시간축: 추정값을 초 단위로 줄여 "N분 남음"이 시계처럼 흐르게.
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      const cur = etaRef.current.remainingSec;
      if (cur == null || cur <= 0) return;
      const next = Math.max(0, cur - 1);
      etaRef.current.remainingSec = next;
      setEtaLabel(formatEtaLabel(next));
    }, 1000);
    return () => window.clearInterval(id);
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
        };
        if (cancelled || !data.ok || !data.phase) return;

        const nextPercent = clampPercent(data.progressPercent, data.phase);
        setPhase(data.phase);
        setStageLabel(data.stageLabel ?? null);
        if (nextPercent > targetPercentRef.current + 0.05) {
          targetRaisedAtRef.current =
            typeof performance !== "undefined" ? performance.now() : Date.now();
        }
        targetPercentRef.current = Math.max(
          targetPercentRef.current,
          nextPercent,
        );

        if (data.phase === "error" || data.phase === "empty") {
          const nextError =
            data.errorMessage ?? MEETING_PROCESS_LABEL[data.phase];
          setError(nextError);
          if (isQuotaBlockedMessage(nextError)) setUsageDialogOpen(true);
          etaRef.current = {
            lastSample: null,
            rate: null,
            remainingSec: null,
          };
          setEtaLabel(null);
          return;
        }
        if (data.phase === "done") {
          setDisplayPercent(100);
          setEtaLabel(null);
          router.refresh();
          return;
        }

        // ETA는 실제(서버) 값 흐름만 본다. 화면 전용 자체 전진은 추정에서 뺀다.
        // 속도는 EMA로 부드럽게(tqdm/progressbar AdaptiveETA).
        const now = Date.now();
        const prev = etaRef.current.lastSample;
        if (!prev) {
          etaRef.current.lastSample = { time: now, percent: nextPercent };
        } else {
          const elapsedSec = (now - prev.time) / 1000;
          const percentGain = nextPercent - prev.percent;
          if (
            elapsedSec >= ETA_MIN_ELAPSED_SEC &&
            percentGain >= ETA_MIN_PERCENT_GAIN
          ) {
            const instantRate = percentGain / elapsedSec;
            const prevRate = etaRef.current.rate;
            const rate =
              prevRate == null
                ? instantRate
                : ETA_RATE_SMOOTH * instantRate +
                  (1 - ETA_RATE_SMOOTH) * prevRate;
            etaRef.current.rate = rate;
            etaRef.current.lastSample = { time: now, percent: nextPercent };

            let remaining = estimateRemainingSec({
              percent: nextPercent,
              percentPerSec: rate,
            });
            if (remaining != null) {
              const prevRemain = etaRef.current.remainingSec;
              if (
                prevRemain != null &&
                remaining > prevRemain * ETA_UPWARD_CAP
              ) {
                remaining = prevRemain * ETA_UPWARD_CAP;
              }
              etaRef.current.remainingSec = remaining;
              setEtaLabel(formatEtaLabel(remaining));
            }
          } else if (percentGain < 0) {
            // 진행이 뒤로 가지 않는 한 lastSample만 시간을 갱신하지 않는다.
            etaRef.current.lastSample = { time: now, percent: nextPercent };
            etaRef.current.rate = null;
          }
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
      />
      <UsageLimitDialog
        open={usageDialogOpen}
        variant="time"
        onClose={() => setUsageDialogOpen(false)}
      />
    </section>
  );
}
