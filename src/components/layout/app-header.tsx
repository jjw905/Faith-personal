"use client";

import { Bell, Menu, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";

import { NotificationPanel } from "@/components/layout/notification-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAppContext } from "@/context/app-context";

// /meetings/ 하위(마스킹, 새 회의, 상세)는 자체 화면이므로 상단바 숨김
function isHeaderVisible(pathname: string) {
  return !pathname.startsWith("/meetings/");
}

export function AppHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const { notificationCount } = useAppContext();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const closeNotifications = useCallback(() => setNotificationsOpen(false), []);

  if (!isHeaderVisible(pathname)) {
    return null;
  }

  return (
    <>
      <header className="sticky top-0 z-30 shrink-0 bg-background/80 backdrop-blur-md">
        <div className="flex h-16 items-center justify-end gap-3 px-4 sm:gap-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="mr-auto h-9 w-9 shrink-0 cursor-pointer hover:bg-surface-2 lg:hidden"
            onClick={onMenuClick}
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button asChild className="h-10 px-4">
              <Link href="/meetings/new">
                <Plus className="h-4 w-4" />
                새 회의
              </Link>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="relative h-11 w-11 cursor-pointer text-foreground/70 hover:bg-surface-2 hover:text-foreground [&_svg]:size-6"
              aria-label="알림 센터"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen(true)}
            >
              <Bell strokeWidth={1.75} />
              {notificationCount > 0 ? (
                <Badge className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]">
                  {notificationCount}
                </Badge>
              ) : null}
            </Button>
          </div>
        </div>
      </header>

      <NotificationPanel
        open={notificationsOpen}
        onClose={closeNotifications}
      />
    </>
  );
}
