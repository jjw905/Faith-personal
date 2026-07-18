"use client";

import { EyeOff, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getNotifications } from "@/lib/mock-loader";
import type { NotificationType } from "@/types/notification";
import { cn } from "@/lib/utils";

function notificationIcon(type: NotificationType) {
  if (type === "masking") return EyeOff;
  if (type === "storage") return ShieldCheck;
  return ShieldAlert;
}

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

/** 헤더 벨에서 열리는 우측 알림 센터. */
export function NotificationPanel({ open, onClose }: NotificationPanelProps) {
  const notifications = getNotifications();

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/40 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        role="dialog"
        aria-modal={open}
        aria-hidden={!open}
        aria-label="알림 센터"
        inert={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card shadow-[0_0_40px_rgba(17,24,46,0.12)] transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              알림 센터
            </h2>
            <p className="text-xs text-muted">
              마스킹, 접근, 저장 상태 알림
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 cursor-pointer text-muted hover:bg-surface-2 hover:text-foreground"
            onClick={onClose}
            aria-label="알림 센터 닫기"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <ul className="divide-y divide-border px-2 py-2">
            {notifications.map((n) => {
              const Icon = notificationIcon(n.type);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className="flex w-full gap-3 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-surface"
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                        n.unread
                          ? "bg-primary-soft text-primary"
                          : "bg-surface text-muted",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-medium text-foreground">
                          {n.title}
                        </p>
                        <span className="shrink-0 text-[11px] text-muted-2">
                          {n.time}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">
                        {n.body}
                      </p>
                    </div>
                    {n.unread ? (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </aside>
    </>
  );
}
