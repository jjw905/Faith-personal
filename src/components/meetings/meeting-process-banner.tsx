"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  MEETING_PROCESS_LABEL,
  type MeetingProcessPhase,
} from "@/lib/meeting-process";
import { cn } from "@/lib/utils";

export type { MeetingProcessPhase };
export { MEETING_PROCESS_LABEL };

function clampPercent(n: unknown, phase: MeetingProcessPhase): number {
  if (typeof n === "number" && Number.isFinite(n)) {
    return Math.max(0, Math.min(100, Math.round(n)));
  }
  if (phase === "structuring") return 72;
  if (phase === "transcribing") return 4;
  if (phase === "done") return 100;
  return 0;
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
        "process-progress-ring relative aspect-square size-[min(7.5rem,42vw)] shrink-0 overflow-hidden",
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
          className="text-primary transition-[stroke-dashoffset] duration-500 ease-out"
        />
      </svg>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="tabular-nums text-[clamp(1.25rem,5vw,1.75rem)] font-semibold tracking-tight text-primary">
          {percent}
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
  className,
}: {
  phase: MeetingProcessPhase;
  error?: string | null;
  progressPercent?: number;
  className?: string;
}) {
  const active = phase === "transcribing" || phase === "structuring";
  const percent = clampPercent(progressPercent, phase);

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
          ? `${MEETING_PROCESS_LABEL[phase]}, ${percent}퍼센트`
          : MEETING_PROCESS_LABEL[phase]
      }
    >
      {active ? <ProcessProgressRing percent={percent} /> : null}

      <div className="relative h-5 overflow-hidden">
        <p
          key={phase}
          className={cn(
            "text-center text-sm font-semibold tracking-tight text-foreground",
            "animate-[process-rise_0.55s_cubic-bezier(0.22,1,0.36,1)_both]",
            phase === "error" && "text-masked",
          )}
        >
          {MEETING_PROCESS_LABEL[phase]}
        </p>
      </div>

      {phase === "error" && error ? (
        <p className="max-w-xs text-center text-sm leading-relaxed text-muted">
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
}: {
  meetingId: string;
  initialPhase: MeetingProcessPhase;
  initialProgressPercent?: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<MeetingProcessPhase>(initialPhase);
  const [progressPercent, setProgressPercent] = useState(() =>
    clampPercent(initialProgressPercent, initialPhase),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (phase === "done") return;
    if (phase === "error") return;

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
        };
        if (cancelled || !data.ok || !data.phase) return;
        setPhase(data.phase);
        setProgressPercent(clampPercent(data.progressPercent, data.phase));
        if (data.phase === "error") {
          setError(data.errorMessage ?? "처리에 실패했습니다.");
          return;
        }
        if (data.phase === "done") {
          router.refresh();
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

  const active = phase === "transcribing" || phase === "structuring";

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
        progressPercent={progressPercent}
      />
    </section>
  );
}
