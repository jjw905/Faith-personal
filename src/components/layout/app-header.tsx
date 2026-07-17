"use client";

import { Bell, Menu, Plus, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAppContext } from "@/context/app-context";

// /meetings/ 하위(마스킹, 새 회의, 상세)는 자체 화면이므로 상단바 숨김
function isHeaderVisible(pathname: string) {
  return !pathname.startsWith("/meetings/");
}

function formatToday() {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date());
}

export function AppHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();
  const { notificationCount } = useAppContext();

  if (!isHeaderVisible(pathname)) {
    return null;
  }

  return (
    <header className="sticky top-0 z-30 shrink-0 bg-background/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 cursor-pointer hover:bg-surface-2 lg:hidden"
            onClick={onMenuClick}
            aria-label="메뉴 열기"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <p className="truncate text-xs text-muted-2">{formatToday()}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative hidden md:block">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-2" />
            <Input
              placeholder="회의, 참석자 검색..."
              className="h-10 w-60 border-transparent bg-surface pl-10 text-sm"
            />
          </div>

          <Button asChild className="h-10 px-4">
            <Link href="/meetings/new">
              <Plus className="h-4 w-4" />
              새 회의
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="relative h-10 w-10 cursor-pointer text-muted hover:bg-surface-2 hover:text-foreground"
            aria-label="알림"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 ? (
              <Badge className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]">
                {notificationCount}
              </Badge>
            ) : null}
          </Button>
        </div>
      </div>
    </header>
  );
}
