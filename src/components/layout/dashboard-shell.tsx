"use client";

import { usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageUxPreviewControl } from "@/components/layout/page-ux-preview-control";
import {
  MeetingChromeProvider,
  useMeetingChrome,
} from "@/context/meeting-chrome-context";
import { PageUxPreviewProvider } from "@/context/page-ux-preview-context";
import { TeamRolePreviewProvider } from "@/context/team-role-preview-context";
import { notifyDocsSectionScroll } from "@/lib/docs-section-spy";
import { cn } from "@/lib/utils";

function DashboardShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { focusMode } = useMeetingChrome();
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const hideChrome = focusMode || pathname === "/help";
  const sidebarOpen = hideChrome ? false : mobileOpen;
  const meetingFocus =
    pathname.startsWith("/meetings/") && !pathname.startsWith("/meetings/new");
  const lightCanvas =
    pathname === "/help" ||
    pathname === "/changelog" ||
    pathname === "/users" ||
    pathname === "/account" ||
    pathname === "/settings" ||
    pathname === "/ai-usage" ||
    pathname === "/dashboard" ||
    pathname === "/team" ||
    pathname === "/audit" ||
    pathname === "/vault" ||
    pathname === "/plan" ||
    pathname === "/design" ||
    pathname.startsWith("/account/") ||
    pathname.startsWith("/settings/") ||
    pathname.startsWith("/changelog/") ||
    pathname.startsWith("/team/") ||
    pathname.startsWith("/vault/") ||
    pathname.startsWith("/plan/") ||
    pathname.startsWith("/meetings");

  useEffect(() => {
    if (!sidebarOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  // 로그인, 라우트 이동 후 남는 포커스 링이 패널 테두리처럼 보이는 현상 방지
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
    <div className="flex h-dvh min-w-0 overflow-hidden bg-app-canvas">
      {!hideChrome ? (
        <>
          <div
            className={cn(
              "fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden",
              sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
            )}
            onClick={closeMobile}
            aria-hidden={!sidebarOpen}
          />
          <Suspense fallback={null}>
            <AppSidebar mobileOpen={sidebarOpen} onMobileClose={closeMobile} />
          </Suspense>
        </>
      ) : null}

      <div
        className={cn(
          "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto",
          lightCanvas && (meetingFocus ? "bg-white" : "bg-background"),
        )}
        onScroll={notifyDocsSectionScroll}
      >
        {!hideChrome ? (
          <AppHeader onMenuClick={() => setMobileOpen(true)} />
        ) : null}
        {!focusMode ? <PageUxPreviewControl /> : null}
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <MeetingChromeProvider>
      <Suspense fallback={null}>
        <PageUxPreviewProvider>
          <TeamRolePreviewProvider>
            <DashboardShellInner>{children}</DashboardShellInner>
          </TeamRolePreviewProvider>
        </PageUxPreviewProvider>
      </Suspense>
    </MeetingChromeProvider>
  );
}
