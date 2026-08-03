"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { MEETING_PROCESS_LABEL, friendlyProcessStageLabel } from "@/lib/meeting-process";
import { useAppContext } from "@/context/app-context";
import { cn } from "@/lib/utils";

type ProcessingItem = {
  id: string;
  title: string;
  phase?: string;
  status: string;
  workspace: string;
  progressPercent: number;
  /** 파이프라인 세부 단계. 없으면 phase 기본 문구. */
  stageLabel?: string | null;
  href?: string;
  /** 워커 잡이 아직 시작 전 */
  waiting?: boolean;
  jobStatus?: "queued" | "running" | null;
  /** 앞에 남은 작업 수. 0이면 곧 시작 */
  queueAhead?: number | null;
};

const DEMO_STAGE_BY_PHASE: Record<string, string[]> = {
  transcribing: [
    "파일을 살펴보는 중이에요",
    "소리를 불러오는 중이에요",
    "받아쓰는 중이에요",
    "빠진 말을 다시 확인하는 중이에요",
  ],
  structuring: [
    "이야기의 흐름을 잡는 중이에요",
    "같은 목소리를 모으는 중이에요",
    "타임라인을 그리는 중이에요",
    "누가 말했는지 맞추는 중이에요",
    "표현을 다듬는 중이에요",
  ],
};

function isActiveItem(phase?: string, status?: string) {
  return (
    phase === "transcribing" ||
    phase === "structuring" ||
    status === "transcribing" ||
    status === "structuring"
  );
}

function fallbackStageLabel(phase?: string) {
  if (phase === "structuring" || phase === "transcribing") {
    return MEETING_PROCESS_LABEL[phase];
  }
  return "제작 중이에요";
}

function clampPercent(n: unknown, phase?: string): number {
  if (typeof n === "number" && Number.isFinite(n)) {
    const minimum = phase === "transcribing" || phase === "structuring" ? 1 : 0;
    return Math.max(minimum, Math.min(100, Math.round(n)));
  }
  if (phase === "structuring") return 72;
  if (phase === "transcribing") return 1;
  return 0;
}

function flipPhase(phase?: string): "transcribing" | "structuring" {
  return phase === "structuring" ? "transcribing" : "structuring";
}

function demoStageFor(phase: string | undefined, percent: number) {
  const key = phase === "structuring" ? "structuring" : "transcribing";
  const list = DEMO_STAGE_BY_PHASE[key]!;
  if (key === "structuring") {
    const t = Math.max(0, Math.min(1, (percent - 72) / 26));
    return list[Math.min(list.length - 1, Math.floor(t * list.length))]!;
  }
  const t = Math.max(0, Math.min(1, percent / 72));
  return list[Math.min(list.length - 1, Math.floor(t * list.length))]!;
}

function inferWaiting(item: {
  waiting?: boolean;
  jobStatus?: "queued" | "running" | null;
  stageLabel?: string | null;
}) {
  if (typeof item.waiting === "boolean") return item.waiting;
  if (item.jobStatus === "queued") return true;
  if (item.jobStatus === "running") return false;
  if (/기다리/.test(item.stageLabel ?? "")) return true;
  return false;
}

function queueAheadLabel(ahead: number | null | undefined) {
  if (ahead == null || ahead < 0) return null;
  if (ahead === 0) return "곧 시작";
  return `앞 ${ahead}건`;
}

function headerCountLabel(items: ProcessingItem[]) {
  const waitingCount = items.filter((item) => inferWaiting(item)).length;
  const runningCount = items.length - waitingCount;
  if (runningCount > 0 && waitingCount > 0) {
    return `진행 ${runningCount} · 대기 ${waitingCount}`;
  }
  if (waitingCount === items.length) {
    return `${items.length}건 대기`;
  }
  return `${items.length}건 처리 중`;
}

/**
 * 실시간 기록 / 파일 올리기 바로 아래.
 * 제작 중이면 회의 제목(리스트와 동일) + 파이프라인 실제 진행률·세부 문구.
 */
export function ProcessingNowSection({
  demoItems,
  animateDemo = false,
  onActiveChange,
}: {
  demoItems?: ProcessingItem[];
  /** UX 미리보기: 진행률·단계 전환 애니메이션 재생 */
  animateDemo?: boolean;
  /** active id 목록이 바뀔 때. 줄어들면 리스트 갱신에 사용. */
  onActiveChange?: (activeIds: string[]) => void;
} = {}) {
  const { workspaceId } = useAppContext();
  const [items, setItems] = useState<ProcessingItem[]>(demoItems ?? []);
  const [fetchFailed, setFetchFailed] = useState(false);
  const lastActiveKeyRef = useRef<string | null>(null);
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const refresh = useCallback(async () => {
    if (demoItems) {
      setItems(demoItems);
      setFetchFailed(false);
      return;
    }
    try {
      const res = await fetch(
        `/api/meetings?workspace=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        activity?: Array<{
          id: string;
          fileName?: string;
          title?: string;
          status: string;
          phase?: string;
          progressPercent?: number;
          detail?: string | null;
          workspace: string;
          href?: string;
          waiting?: boolean;
          jobStatus?: "queued" | "running" | null;
          queueAhead?: number | null;
        }>;
      };
      if (!data.ok || !Array.isArray(data.activity)) {
        setFetchFailed(true);
        // 실패 시 기존 목록 유지 (통째로 사라지지 않게)
        return;
      }
      setFetchFailed(false);
      const next = data.activity
        .filter(
          (a) =>
            a.workspace === workspaceId &&
            isActiveItem(a.phase, a.status),
        )
        .map((a) => {
          const progressPercent = clampPercent(a.progressPercent, a.phase);
          const stageLabel = a.detail?.trim() || fallbackStageLabel(a.phase);
          return {
            id: a.id,
            title: (a.title || a.fileName || "파일").trim() || "파일",
            phase: a.phase,
            status: a.status,
            workspace: a.workspace,
            progressPercent,
            stageLabel,
            href: a.href ?? `/meetings/${a.id}`,
            waiting: a.waiting,
            jobStatus: a.jobStatus ?? null,
            queueAhead: a.queueAhead ?? null,
          };
        })
        // 진행 중 → 대기(앞선 수 적은 순)로 읽어 순서 안정
        .sort((a, b) => {
          const aw = inferWaiting(a) ? 1 : 0;
          const bw = inferWaiting(b) ? 1 : 0;
          if (aw !== bw) return aw - bw;
          return (a.queueAhead ?? 0) - (b.queueAhead ?? 0);
        });
      setItems((prev) => {
        if (
          prev.length === next.length &&
          prev.every(
            (item, i) =>
              item.id === next[i]?.id &&
              item.phase === next[i]?.phase &&
              item.status === next[i]?.status &&
              item.progressPercent === next[i]?.progressPercent &&
              item.stageLabel === next[i]?.stageLabel &&
              item.title === next[i]?.title &&
              item.waiting === next[i]?.waiting &&
              item.jobStatus === next[i]?.jobStatus &&
              item.queueAhead === next[i]?.queueAhead,
          )
        ) {
          return prev;
        }
        return next;
      });
    } catch {
      setFetchFailed(true);
    }
  }, [workspaceId, demoItems]);

  useEffect(() => {
    lastActiveKeyRef.current = null;
  }, [workspaceId]);

  useEffect(() => {
    if (animateDemo) return;
    void refresh();
  }, [refresh, animateDemo]);

  // 비어 있어도 느리게 폴링 — 업로드 직후·다른 탭 복귀 때 대기열이 안 뜨는 구멍 막음
  useEffect(() => {
    if (demoItems) return;
    if (animateDemo) return;
    const ms = items.length === 0 ? 3000 : 1000;
    const id = window.setInterval(() => void refresh(), ms);
    return () => window.clearInterval(id);
  }, [refresh, demoItems, animateDemo, items.length]);

  useEffect(() => {
    if (demoItems) return;
    if (animateDemo) return;
    const onShow = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onShow);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.removeEventListener("focus", onShow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [refresh, demoItems, animateDemo]);

  useEffect(() => {
    if (!animateDemo || !demoItems?.length) return;
    setItems(
      demoItems.map((item) => {
        const progressPercent = clampPercent(item.progressPercent, item.phase);
        return {
          ...item,
          progressPercent,
          href: item.href ?? `/meetings/${item.id}`,
          stageLabel:
            item.stageLabel ?? demoStageFor(item.phase, progressPercent),
        };
      }),
    );
    const id = window.setInterval(() => {
      setItems((prev) =>
        prev.map((item, index) => {
          if (inferWaiting(item) && item.progressPercent <= 1) {
            return item;
          }
          // 짝/홀 속도만 다르게, 1→98까지 이어서 올린 뒤 리셋
          const step = index % 2 === 0 ? 2.4 : 1.8;
          const next = item.progressPercent + step;
          if (next >= 98) {
            const phase = flipPhase(item.phase);
            const progressPercent = phase === "structuring" ? 72 : 1;
            return {
              ...item,
              phase,
              status: phase,
              waiting: false,
              jobStatus: "running" as const,
              progressPercent,
              stageLabel: demoStageFor(phase, progressPercent),
            };
          }
          const progressPercent = Math.round(next * 10) / 10;
          return {
            ...item,
            waiting: false,
            jobStatus: "running" as const,
            progressPercent,
            stageLabel: demoStageFor(item.phase, progressPercent),
          };
        }),
      );
    }, 220);
    return () => window.clearInterval(id);
  }, [animateDemo, demoItems]);

  useEffect(() => {
    const activeIds = items.map((i) => i.id);
    const key = activeIds.join("\0");
    if (lastActiveKeyRef.current === key) return;
    const prevKey = lastActiveKeyRef.current;
    lastActiveKeyRef.current = key;
    // 최초 마운트 알림은 건너뛰고, active id가 실제로 바뀔 때만 부모 갱신
    if (prevKey === null) return;
    onActiveChangeRef.current?.(activeIds);
  }, [items]);

  if (items.length === 0 && !fetchFailed) return null;

  return (
    <section
      className="overflow-hidden rounded-3xl bg-card shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border"
      aria-label={
        items.length > 0
          ? `분석 대기열 ${items.length}건`
          : "분석 대기열"
      }
      aria-live="polite"
    >
      <div className="space-y-3 bg-card px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            분석 대기열
          </h2>
          <span className="shrink-0 text-base tabular-nums text-muted">
            {items.length > 0 ? headerCountLabel(items) : "분석 목록을 불러오는 중이에요"}
          </span>
        </div>

        {fetchFailed && items.length === 0 ? (
          <div
            role="status"
            className="rounded-2xl bg-surface px-4 py-3.5 ring-1 ring-border"
          >
            <p className="text-base font-semibold text-foreground">
              대기열을 불러오지 못했어요
            </p>
            <p className="mt-1 text-base text-muted">
              잠시 후 다시 시도해 주세요.
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-3 inline-flex min-h-12 items-center rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground"
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {fetchFailed && items.length > 0 ? (
          <p role="status" className="text-base text-muted">
            잠시 늦어지고 있어요. 자동으로 다시 보여드릴게요.
          </p>
        ) : null}

        {items.length > 0 ? (
          <ul className="max-h-[min(32rem,60vh)] space-y-3 overflow-y-auto overscroll-contain pr-1">
            {items.map((item) => {
              const waiting = inferWaiting(item);
              const percent = item.progressPercent;
              const stage = friendlyProcessStageLabel(
                item.stageLabel?.trim() || fallbackStageLabel(item.phase),
              );
              const ahead = queueAheadLabel(item.queueAhead);
              const href = item.href ?? `/meetings/${item.id}`;
              const metaBits = [stage, waiting ? ahead : null].filter(
                Boolean,
              ) as string[];

              return (
                <li key={item.id}>
                  {/* M3 list item: headline / supporting / trailing + linear track */}
                  <Link
                    href={href}
                    className="relative block overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 ring-border transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex min-h-12 items-start gap-3 px-4 py-3.5 pr-4 sm:px-5 sm:py-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 truncate text-lg font-semibold tracking-tight text-foreground">
                            {item.title}
                          </p>
                          <span
                            className={cn(
                              "shrink-0 self-start pt-0.5 text-right text-base font-semibold tabular-nums tracking-tight",
                              waiting
                                ? "min-w-[2.75rem] text-muted"
                                : "min-w-[3.25rem] text-primary",
                            )}
                            aria-label={
                              waiting
                                ? "대기 중"
                                : `진행 ${percent}퍼센트`
                            }
                          >
                            {waiting ? "대기" : `${percent}%`}
                          </span>
                        </div>
                        <div className="relative mt-0.5 h-6 overflow-hidden">
                          <p
                            key={`${item.id}-${metaBits.join("|")}`}
                            className="truncate text-base text-muted motion-safe:animate-[process-rise_0.55s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
                          >
                            {metaBits.join(" · ")}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-surface-2"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={waiting ? undefined : percent}
                      aria-valuetext={
                        waiting ? "대기 중" : `${percent}퍼센트`
                      }
                    >
                      {waiting ? (
                        <div
                          className="h-full w-1/3 rounded-full bg-primary/45 motion-safe:animate-[process-queue-indeterminate_1.4s_ease-in-out_infinite] motion-reduce:w-full motion-reduce:opacity-40"
                        />
                      ) : (
                        <div
                          className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
                          style={{ width: `${Math.max(percent, 1)}%` }}
                        />
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
