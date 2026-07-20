"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  MeetingChromeProvider,
  useMeetingChrome,
} from "@/context/meeting-chrome-context";
import { cn } from "@/lib/utils";

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { focusMode } = useMeetingChrome();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const hideChrome = focusMode || pathname === "/help";

  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (hideChrome) setMobileOpen(false);
  }, [hideChrome]);

  // 로그인·라우트 이동 후 남는 포커스 링이 패널 테두리처럼 보이는 현상 방지
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      const el = document.activeElement;
      if (!(el instanceof HTMLElement) || el === document.body) return;
      if (el.matches("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      el.blur();
    });
    return () => window.cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <div className="flex h-dvh min-w-0 overflow-hidden bg-background">
      {!hideChrome ? (
        <>
          <div
            className={cn(
              "fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden",
              mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            onClick={closeMobile}
            aria-hidden={!mobileOpen}
          />
          <AppSidebar mobileOpen={mobileOpen} onMobileClose={closeMobile} />
        </>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {!hideChrome ? (
          <AppHeader onMenuClick={() => setMobileOpen(true)} />
        ) : null}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <MeetingChromeProvider>
      <DashboardShellInner>{children}</DashboardShellInner>
    </MeetingChromeProvider>
  );
}
