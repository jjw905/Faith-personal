"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MEETING_PROCESS_LABEL } from "@/lib/meeting-process";
import { useAppContext } from "@/context/app-context";
import { cn } from "@/lib/utils";

type ProcessingItem = {
  id: string;
  title: string;
  phase?: string;
  status: string;
  workspace: string;
  progressPercent: number;
  indeterminate?: boolean;
};

function isActiveItem(phase?: string, status?: string) {
  return (
    phase === "transcribing" ||
    phase === "structuring" ||
    status === "transcribing" ||
    status === "structuring"
  );
}

function phaseLabel(phase?: string) {
  if (phase === "structuring" || phase === "transcribing") {
    return MEETING_PROCESS_LABEL[phase];
  }
  return "제작 중";
}

function clampPercent(n: unknown, phase?: string): number {
  if (typeof n === "number" && Number.isFinite(n)) {
    return Math.max(0, Math.min(100, Math.round(n)));
  }
  if (phase === "structuring") return 72;
  if (phase === "transcribing") return 0;
  return 0;
}

function flipPhase(phase?: string): "transcribing" | "structuring" {
  return phase === "structuring" ? "transcribing" : "structuring";
}

/**
 * 실시간 기록 / 파일 올리기 바로 아래.
 * 제작 중이면 회의 제목(리스트와 동일) + 파이프라인 실제 진행률.
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
  const lastActiveKeyRef = useRef<string | null>(null);
  const lastProgressRef = useRef(
    new Map<string, { percent: number; changedAt: number }>(),
  );
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const refresh = useCallback(async () => {
    if (demoItems) {
      setItems(demoItems);
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
          workspace: string;
        }>;
      };
      if (!data.ok || !Array.isArray(data.activity)) {
        lastProgressRef.current.clear();
        setItems((prev) => (prev.length === 0 ? prev : []));
        return;
      }
      const now = Date.now();
      const next = data.activity
        .filter(
          (a) =>
            a.workspace === workspaceId &&
            isActiveItem(a.phase, a.status),
        )
        .map((a) => {
          const progressPercent = clampPercent(a.progressPercent, a.phase);
          const previous = lastProgressRef.current.get(a.id);
          const progress =
            previous && previous.percent === progressPercent
              ? previous
              : { percent: progressPercent, changedAt: now };
          lastProgressRef.current.set(a.id, progress);
          return {
            id: a.id,
            title: (a.title || a.fileName || "파일").trim() || "파일",
            phase: a.phase,
            status: a.status,
            workspace: a.workspace,
            progressPercent,
            indeterminate: now - progress.changedAt >= 3_000,
          };
        });
      const activeIds = new Set(next.map((item) => item.id));
      for (const id of lastProgressRef.current.keys()) {
        if (!activeIds.has(id)) lastProgressRef.current.delete(id);
      }
      setItems((prev) => {
        if (
          prev.length === next.length &&
          prev.every(
            (item, i) =>
              item.id === next[i]?.id &&
              item.phase === next[i]?.phase &&
              item.status === next[i]?.status &&
              item.progressPercent === next[i]?.progressPercent &&
              item.indeterminate === next[i]?.indeterminate &&
              item.title === next[i]?.title,
          )
        ) {
          return prev;
        }
        return next;
      });
    } catch {
      lastProgressRef.current.clear();
      setItems((prev) => (prev.length === 0 ? prev : []));
    }
  }, [workspaceId, demoItems]);

  useEffect(() => {
    lastActiveKeyRef.current = null;
    lastProgressRef.current.clear();
  }, [workspaceId]);

  useEffect(() => {
    if (animateDemo) return;
    void refresh();
  }, [refresh, animateDemo]);

  useEffect(() => {
    if (demoItems) return;
    if (animateDemo) return;
    if (items.length === 0) return;
    const id = window.setInterval(() => void refresh(), 1000);
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
      demoItems.map((item) => ({
        ...item,
        progressPercent: clampPercent(item.progressPercent, item.phase),
        indeterminate: false,
      })),
    );
    const id = window.setInterval(() => {
      setItems((prev) =>
        prev.map((item, index) => {
          // 짝/홀 속도만 다르게, 1→98까지 이어서 올린 뒤 리셋
          const step = index % 2 === 0 ? 2.4 : 1.8;
          const next = item.progressPercent + step;
          if (next >= 98) {
            const phase = flipPhase(item.phase);
            return {
              ...item,
              phase,
              status: phase,
              progressPercent: phase === "structuring" ? 72 : 1,
              indeterminate: false,
            };
          }
          return {
            ...item,
            progressPercent: Math.round(next * 10) / 10,
            indeterminate: false,
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

  if (items.length === 0) return null;

  return (
    <section
      className="overflow-hidden rounded-3xl bg-card shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border"
      aria-label={`분석 대기열 ${items.length}건`}
      aria-live="polite"
    >
      <div className="space-y-3 bg-card px-4 pb-4 pt-4 sm:px-6 sm:pb-5 sm:pt-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            분석 대기열
          </h2>
          <span className="shrink-0 text-base tabular-nums text-muted">
            {items.length}건 처리 중
          </span>
        </div>
        <ul className="max-h-[min(32rem,60vh)] space-y-2 overflow-y-auto overscroll-contain pr-1">
          {items.map((item) => {
            const percent = item.progressPercent;
            const indeterminate = item.indeterminate === true;

            return (
              <li key={item.id}>
                <div className="relative overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 ring-border">
                  <div className="flex items-center gap-3 px-4 py-3.5 pr-5 sm:px-5 sm:pr-6 sm:py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold tracking-tight text-foreground">
                        {item.title}
                      </p>
                      <p
                        key={`${item.id}-${item.phase}`}
                        className="mt-0.5 text-base text-muted animate-[process-rise_0.55s_cubic-bezier(0.22,1,0.36,1)_both]"
                      >
                        {phaseLabel(item.phase)}
                      </p>
                    </div>
                    <span
                      className="shrink-0 self-center tabular-nums text-base font-semibold tracking-tight text-primary"
                      aria-label={`진행 ${percent}퍼센트`}
                    >
                      {percent}%
                    </span>
                  </div>
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-surface-2"
                    aria-hidden
                  >
                    <div
                      className={cn(
                        "h-full rounded-full bg-primary/65",
                        indeterminate &&
                          "motion-safe:animate-pulse motion-reduce:animate-none",
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
