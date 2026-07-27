"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { NotificationPanel } from "@/components/layout/notification-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MaterialSymbol } from "@/components/ui/material-symbol";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { isPageUxNotificationScenario } from "@/lib/page-ux-registry";

// /meetings/ 하위(마스킹, 새 회의, 상세)는 자체 화면이므로 상단바 숨김
function isHeaderVisible(pathname: string) {
  return !pathname.startsWith("/meetings/");
}

export function AppHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const { notificationCount } = useAppContext();
  const { scenarioId } = usePageUxPreview();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const closeNotifications = useCallback(() => {
    if (isPageUxNotificationScenario(scenarioId)) return;
    setNotificationsOpen(false);
  }, [scenarioId]);

  useEffect(() => {
    setNotificationsOpen(isPageUxNotificationScenario(scenarioId));
  }, [scenarioId]);

  if (!isHeaderVisible(pathname)) {
    return null;
  }

  return (
    <>
      <header className="shrink-0 bg-transparent">
        <div className="flex h-16 items-center justify-end gap-3 px-4 sm:gap-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="mr-auto h-12 w-12 shrink-0 cursor-pointer hover:bg-surface-2 lg:hidden"
            onClick={onMenuClick}
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Button
            type="button"
            variant="default"
            size="icon"
            className="relative h-12 w-12 shrink-0 cursor-pointer rounded-full shadow-soft hover:bg-primary-hover md:h-11 md:w-11 [&_svg]:size-6"
            aria-label="알림 센터"
            aria-expanded={notificationsOpen}
            onClick={() => setNotificationsOpen(true)}
          >
            <MaterialSymbol name="notifications" size={24} weight={400} />
            {notificationCount > 0 ? (
              <Badge className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-0 bg-card px-1 text-xs font-semibold text-primary shadow-soft ring-2 ring-primary">
                N
              </Badge>
            ) : null}
          </Button>
        </div>
      </header>

      <NotificationPanel
        open={notificationsOpen}
        onClose={closeNotifications}
      />
    </>
  );
}
