"use client";

import { Activity, CheckCircle2, Inbox, Loader2, Shield } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import { useAppContext } from "@/context/app-context";
import {
  getProcessingByWorkspace,
  type ProcessItem,
  type ProcessStatus,
} from "@/lib/workspace-data";
import { cn } from "@/lib/utils";

function statusVisual(status: ProcessStatus) {
  if (status === "masking") {
    return {
      label: "개인정보 검수",
      icon: Shield,
      className: "bg-primary-soft text-primary",
    };
  }
  if (status === "transcribing") {
    return {
      label: "받아쓰기",
      icon: Loader2,
      className: "bg-warning-soft text-warning",
    };
  }
  return {
    label: "정리됨",
    icon: CheckCircle2,
    className: "bg-success-soft text-success",
  };
}

function ProcessRow({
  item,
  onNavigate,
}: {
  item: ProcessItem;
  onNavigate: () => void;
}) {
  const visual = statusVisual(item.status);
  const Icon = visual.icon;

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
        <Icon
          className={cn(
            "h-4 w-4",
            item.status === "transcribing" && "animate-spin",
          )}
          strokeWidth={1.75}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium text-foreground">
            {item.title}
          </p>
          <span className="shrink-0 text-[11px] text-muted-2">{item.time}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          <span className="font-medium text-foreground/80">{visual.label}</span>
          {", "}
          {item.detail}
        </p>
      </div>
    </Link>
  );
}

/** 헤더 등에서 클릭 시 열리는 최근 회의 활동 팝업. */
export function ProcessingStatusPopup() {
  const { workspaceId, workspace } = useAppContext();
  const items = getProcessingByWorkspace(workspaceId);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const activeItems = items.filter((p) => p.status !== "done");
  const doneItems = items.filter((p) => p.status === "done");
  const activeCount = activeItems.length;

  useEffect(() => {
    if (!open) return;

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
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium shadow-soft transition-colors hover:bg-surface",
          activeCount > 0 ? "text-foreground" : "text-muted",
          open && "border-primary bg-primary-soft text-foreground",
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
          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
            {activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="최근 회의 활동"
          className="absolute top-[calc(100%+0.5rem)] right-0 z-40 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-[0_16px_40px_rgba(17,24,46,0.14)]"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">
              최근 회의 활동
            </p>
            <span className="text-[11px] text-muted-2">
              {workspace.title}
              {", "}
              {activeCount > 0 ? `진행 ${activeCount}` : "대기 없음"}
            </span>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {activeCount === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface text-muted-2">
                  <Inbox className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <p className="text-sm font-medium text-foreground">
                  진행 중인 회의가 없습니다
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  녹음이나 업로드를 시작하면
                  <br />
                  안건,받아쓰기 흐름이 여기에 표시됩니다.
                </p>
              </div>
            ) : (
              <ul className="space-y-1">
                {activeItems.map((item) => (
                  <li key={item.id}>
                    <ProcessRow item={item} onNavigate={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            )}

            {doneItems.length > 0 ? (
              <div
                className={cn(activeCount > 0 && "mt-2 border-t border-border pt-2")}
              >
                <p className="px-3 pb-1 text-[11px] font-medium text-muted-2">
                  최근 회의
                </p>
                <ul className="space-y-1">
                  {doneItems.map((item) => (
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
