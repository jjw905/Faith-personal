"use client";

import {
  Activity,
  CheckCircle2,
  CircleSlash,
  Inbox,
  Shield,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { useAppContext } from "@/context/app-context";
import { MEETING_PROCESS_LABEL } from "@/lib/meeting-process";
import {
  getProcessingByWorkspace,
  type ProcessItem,
} from "@/lib/workspace-data";
import { cn } from "@/lib/utils";

function isActiveProcess(item: ProcessItem) {
  return (
    item.status === "transcribing" ||
    item.status === "structuring" ||
    item.phase === "transcribing" ||
    item.phase === "structuring"
  );
}

function isErrorProcess(item: ProcessItem) {
  return item.status === "error" || item.phase === "error";
}

function isEmptyProcess(item: ProcessItem) {
  return item.status === "empty" || item.phase === "empty";
}

function statusVisual(item: ProcessItem) {
  if (isActiveProcess(item)) {
    const phase =
      item.phase === "structuring" || item.status === "structuring"
        ? "structuring"
        : "transcribing";
    return {
      label: MEETING_PROCESS_LABEL[phase],
      kind: "active" as const,
      className: "bg-primary-soft text-primary",
    };
  }
  if (isErrorProcess(item)) {
    return {
      label: MEETING_PROCESS_LABEL.error,
      kind: "error" as const,
      className: "bg-masked-soft text-masked",
    };
  }
  if (isEmptyProcess(item)) {
    return {
      label: MEETING_PROCESS_LABEL.empty,
      kind: "empty" as const,
      className: "bg-surface-2 text-muted",
    };
  }
  if (item.status === "masking") {
    return {
      label: "개인정보 검수",
      kind: "masking" as const,
      className: "bg-primary-soft text-primary",
    };
  }
  return {
    label: MEETING_PROCESS_LABEL.done,
    kind: "done" as const,
    className: "bg-success-soft text-success",
  };
}

function processSubtitle(item: ProcessItem, label: string) {
  if (
    isActiveProcess(item) &&
    typeof item.progressPercent === "number" &&
    Number.isFinite(item.progressPercent)
  ) {
    const stageText = item.detail && item.detail !== label ? item.detail : label;
    return `${stageText}, ${Math.round(item.progressPercent)}%`;
  }
  if (item.detail && item.detail !== label) return item.detail;
  return label;
}

function ProcessRow({
  item,
  onNavigate,
}: {
  item: ProcessItem;
  onNavigate: () => void;
}) {
  const visual = statusVisual(item);
  const subtitle = processSubtitle(item, visual.label);
  const percent =
    isActiveProcess(item) &&
    typeof item.progressPercent === "number" &&
    Number.isFinite(item.progressPercent)
      ? Math.round(item.progressPercent)
      : null;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface"
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
          visual.className,
        )}
      >
        {visual.kind === "active" && percent != null ? (
          <span className="tabular-nums text-xs font-semibold leading-none">
            {percent}
          </span>
        ) : visual.kind === "error" ? (
          <XCircle className="h-4 w-4" strokeWidth={1.75} />
        ) : visual.kind === "empty" ? (
          <CircleSlash className="h-4 w-4" strokeWidth={1.75} />
        ) : visual.kind === "masking" ? (
          <Shield className="h-4 w-4" strokeWidth={1.75} />
        ) : (
          <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {item.title}
          </p>
          <span className="shrink-0 text-xs text-muted-2">{item.time}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
      </div>
    </Link>
  );
}

/** 헤더 등에서 클릭 시 열리는 최근 회의 활동 팝업. */
export function ProcessingStatusPopup({
  demoItems,
  forceOpen,
}: {
  /** 디자인 랩: 고정 목록, 폴링 없음 */
  demoItems?: ProcessItem[];
  /** 디자인 랩: 패널 항상 열림 */
  forceOpen?: boolean;
} = {}) {
  const { workspaceId, workspace } = useAppContext();
  const isDemo = Boolean(demoItems);
  const [items, setItems] = useState<ProcessItem[]>(() => demoItems ?? []);
  const [loaded, setLoaded] = useState(isDemo);
  const [open, setOpen] = useState(Boolean(forceOpen));
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const panelOpen = forceOpen || open;

  useEffect(() => {
    if (!demoItems) return;
    setItems(demoItems);
    setLoaded(true);
  }, [demoItems]);

  const refresh = useCallback(async () => {
    if (isDemo) return;
    try {
      const res = await fetch(
        `/api/meetings?workspace=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        activity?: ProcessItem[];
      };
      if (data.ok && Array.isArray(data.activity)) {
        setItems(
          data.activity.filter((a) => a.workspace === workspaceId),
        );
        setLoaded(true);
        return;
      }
    } catch {
      // fall through
    }
    setItems(getProcessingByWorkspace(workspaceId));
    setLoaded(true);
  }, [workspaceId, isDemo]);

  useEffect(() => {
    if (isDemo) return;
    void refresh();
  }, [refresh, isDemo]);

  const activeItems = items.filter(isActiveProcess);
  const activeCount = activeItems.length;

  useEffect(() => {
    if (isDemo) return;
    if (!panelOpen && activeCount === 0) return;
    if (!panelOpen) return;
    void refresh();
    if (activeCount === 0) return;
    const id = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(id);
  }, [panelOpen, refresh, activeCount, isDemo]);

  useEffect(() => {
    if (isDemo) return;
    if (panelOpen) return;
    if (activeCount === 0) return;
    const id = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(id);
  }, [panelOpen, activeCount, refresh, isDemo]);

  const doneItems = items.filter(
    (p) => !isActiveProcess(p) && !isErrorProcess(p) && !isEmptyProcess(p),
  );
  const errorItems = items.filter(isErrorProcess);
  const emptyItems = items.filter(isEmptyProcess);

  useEffect(() => {
    if (!panelOpen || forceOpen) return;

    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen, forceOpen]);

  const settledItems = [...errorItems, ...emptyItems, ...doneItems];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={panelOpen}
        aria-controls={panelId}
        onClick={() => {
          if (forceOpen) return;
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl bg-card px-3 text-sm font-medium shadow-soft transition-colors hover:bg-surface",
          activeCount > 0 ? "text-foreground" : "text-muted",
          panelOpen && "border-primary bg-primary-soft text-foreground",
        )}
      >
        <Activity
          className={cn(
            "h-4 w-4",
            activeCount > 0 ? "text-primary" : "text-muted-2",
          )}
          strokeWidth={1.75}
        />
        최근 활동
        {activeCount > 0 ? (
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
            {activeCount}
          </span>
        ) : null}
      </button>

      {panelOpen ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="최근 회의 활동"
          className="absolute top-[calc(100%+0.5rem)] right-0 z-40 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl bg-card shadow-[0_16px_40px_rgba(17,24,46,0.14)]"
        >
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <p className="text-sm font-semibold text-foreground">
              최근 회의 활동
            </p>
            <span className="text-xs text-muted-2">
              {workspace.title}
              {", "}
              {activeCount > 0 ? `진행 ${activeCount}` : "대기 없음"}
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {loaded && activeCount === 0 && settledItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface text-muted-2">
                  <Inbox className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <p className="text-sm font-medium text-foreground">
                  진행 중인 회의가 없습니다
                </p>
              </div>
            ) : null}

            {activeCount > 0 ? (
              <ul className="space-y-1">
                {activeItems.map((item) => (
                  <li key={item.id}>
                    <ProcessRow item={item} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            ) : null}

            {settledItems.length > 0 ? (
              <div
                className={cn(activeCount > 0 && "mt-2 border-t border-border/60 pt-2")}
              >
                <p className="px-3 pb-1 text-xs font-medium text-muted-2">
                  최근 회의
                </p>
                <ul className="space-y-1">
                  {settledItems.map((item) => (
                    <li key={item.id}>
                      <ProcessRow
                        item={item}
                        onNavigate={() => setOpen(false)}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
