"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MEETING_PROCESS_LABEL } from "@/lib/meeting-process";
import { useAppContext } from "@/context/app-context";

type ProcessingItem = {
  id: string;
  title: string;
  phase?: string;
  status: string;
  workspace: string;
  progressPercent: number;
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
  if (phase === "transcribing") return 4;
  return 0;
}

function flipPhase(phase?: string): "transcribing" | "structuring" {
  return phase === "structuring" ? "transcribing" : "structuring";
}

/**
 * 기록 시작 / 파일 올리기 바로 아래.
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
      demoItems.map((item) => ({
        ...item,
        progressPercent: clampPercent(item.progressPercent, item.phase),
      })),
    );
    const id = window.setInterval(() => {
      setItems((prev) =>
        prev.map((item, index) => {
          const step = index % 2 === 0 ? 4 : 3;
          const next = item.progressPercent + step;
          if (next >= 96) {
            const phase = flipPhase(item.phase);
            return {
              ...item,
              phase,
              status: phase,
              progressPercent: phase === "structuring" ? 58 : 8,
            };
          }
          return { ...item, progressPercent: next };
        }),
      );
    }, 380);
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
    <section className="space-y-2" aria-label="제작 중" aria-live="polite">
      <ul className="space-y-2">
        {items.map((item) => {
          const percent = item.progressPercent;

          return (
            <li key={item.id}>
              <div className="relative overflow-hidden rounded-2xl bg-card shadow-soft">
                <div className="flex items-center gap-3 px-3.5 py-3.5 pr-5 sm:px-4 sm:pr-6 sm:py-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold tracking-tight text-foreground">
                      {item.title}
                    </p>
                    <p
                      key={`${item.id}-${item.phase}`}
                      className="mt-0.5 text-xs text-muted animate-[process-rise_0.55s_cubic-bezier(0.22,1,0.36,1)_both]"
                    >
                      {phaseLabel(item.phase)}
                    </p>
                  </div>
                  <span
                    className="shrink-0 self-center tabular-nums text-sm font-semibold tracking-tight text-primary"
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
                    className="h-full rounded-full bg-primary/65 transition-[width] duration-300 ease-out"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
