"use client";

import { Bell, Plus, Search } from "lucide-react";
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

export function AppHeader() {
  const pathname = usePathname();
  const { notificationCount } = useAppContext();

  if (!isHeaderVisible(pathname)) {
    return null;
  }

  return (
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between gap-4 px-6">
        <p className="truncate text-xs text-muted-2">{formatToday()}</p>

        <div className="flex items-center gap-2">
          <div className="relative hidden md:block">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-2" />
            <Input
              placeholder="회의, 참석자 검색..."
              className="h-8 w-56 border-transparent bg-surface pl-8 text-sm"
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="relative h-8 w-8 text-muted hover:bg-surface hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
            {notificationCount > 0 ? (
              <Badge className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px]">
                {notificationCount}
              </Badge>
            ) : null}
          </Button>

          <Button asChild size="sm" className="h-8">
            <Link href="/meetings/new">
              <Plus className="h-3.5 w-3.5" />
              새 회의
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
