"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MEETING_PROCESS_LABEL, friendlyProcessStageLabel } from "@/lib/meeting-process";
import { useAppContext } from "@/context/app-context";

type ProcessingItem = {
  id: string;
  title: string;
  phase?: string;
  status: string;
  workspace: string;
  progressPercent: number;
  /** 파이프라인 세부 단계. 없으면 phase 기본 문구. */
  stageLabel?: string | null;
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
    return Math.max(0, Math.min(100, Math.round(n)));
  }
  if (phase === "structuring") return 72;
  if (phase === "transcribing") return 0;
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
  const lastActiveKeyRef = useRef<string | null>(null);
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
          detail?: string | null;
          workspace: string;
        }>;
      };
      if (!data.ok || !Array.isArray(data.activity)) {
        setItems((prev) => (prev.length === 0 ? prev : []));
        return;
      }
      const next = data.activity
        .filter(
          (a) =>
            a.workspace === workspaceId &&
            isActiveItem(a.phase, a.status),
        )
        .map((a) => ({
          id: a.id,
          title: (a.title || a.fileName || "파일").trim() || "파일",
          phase: a.phase,
          status: a.status,
          workspace: a.workspace,
          progressPercent: clampPercent(a.progressPercent, a.phase),
          stageLabel: a.detail?.trim() || fallbackStageLabel(a.phase),
        }));
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
              item.title === next[i]?.title,
          )
        ) {
          return prev;
        }
        return next;
      });
    } catch {
      setItems((prev) => (prev.length === 0 ? prev : []));
    }
  }, [workspaceId, demoItems]);

  useEffect(() => {
    lastActiveKeyRef.current = null;
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
      demoItems.map((item) => {
        const progressPercent = clampPercent(item.progressPercent, item.phase);
        return {
          ...item,
          progressPercent,
          stageLabel:
            item.stageLabel ?? demoStageFor(item.phase, progressPercent),
        };
      }),
    );
    const id = window.setInterval(() => {
      setItems((prev) =>
        prev.map((item, index) => {
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
              progressPercent,
              stageLabel: demoStageFor(phase, progressPercent),
            };
          }
          const progressPercent = Math.round(next * 10) / 10;
          return {
            ...item,
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
            const stage = friendlyProcessStageLabel(
              item.stageLabel?.trim() || fallbackStageLabel(item.phase),
            );

            return (
              <li key={item.id}>
                <div className="relative overflow-hidden rounded-2xl bg-surface shadow-soft ring-1 ring-border">
                  <div className="flex items-center gap-3 px-4 py-3.5 pr-5 sm:px-5 sm:pr-6 sm:py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold tracking-tight text-foreground">
                        {item.title}
                      </p>
                      <div className="relative mt-0.5 h-6 overflow-hidden">
                        <p
                          key={`${item.id}-${stage}`}
                          className="truncate text-base text-muted motion-safe:animate-[process-rise_0.55s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
                        >
                          {stage}
                        </p>
                      </div>
                    </div>
                    <span
                      className="shrink-0 self-center tabular-nums text-base font-semibold tracking-tight text-primary"
                      aria-label={`진행 ${percent}퍼센트`}
                    >
                      {percent}%
                    </span>
                  </div>
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-1 overflow-hidden bg-surface-2"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={percent}
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
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
