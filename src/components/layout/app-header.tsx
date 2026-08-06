"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";

// /meetings/ 하위(마스킹, 새 회의, 상세)는 자체 화면이므로 상단바 숨김
function isHeaderVisible(pathname: string) {
  return !pathname.startsWith("/meetings/");
}

export function AppHeader({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname();

  if (!isHeaderVisible(pathname)) {
    return null;
  }

  return (
    <header className="shrink-0 bg-transparent">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-12 w-12 shrink-0 cursor-pointer hover:bg-surface-2 md:hidden [&_svg]:size-6"
          onClick={onMenuClick}
          aria-label="메뉴 열기"
        >
          <Menu />
        </Button>
      </div>
    </header>
  );
}
