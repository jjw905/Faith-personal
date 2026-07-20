"use client";

import { LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAppContext } from "@/context/app-context";
import { cn } from "@/lib/utils";

const MENU_ITEMS = [
  {
    label: "개인정보 변경",
    href: "/account",
    icon: UserRound,
  },
  {
    label: "시스템 설정",
    href: "/settings",
    icon: Settings,
  },
] as const;

export function UserProfile({ onNavigate }: { onNavigate?: () => void }) {
  const { currentUser } = useAppContext();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const active =
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/");

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={rootRef} className="relative">
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="계정 메뉴"
          className="absolute bottom-0 left-full z-50 ml-2 w-48 overflow-hidden rounded-xl bg-surface py-1 shadow-float ring-1 ring-border-strong"
        >
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const itemActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onNavigate?.();
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm outline-none transition-colors",
                  "hover:bg-card",
                  "focus-visible:bg-card",
                  itemActive
                    ? "bg-card font-medium text-foreground"
                    : "text-muted",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    itemActive ? "text-primary" : "text-muted-2",
                  )}
                  strokeWidth={1.75}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut({ callbackUrl: "/login" });
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm text-muted outline-none transition-colors hover:bg-card hover:text-foreground focus-visible:bg-card"
          >
            <LogOut className="h-4 w-4 shrink-0 text-muted-2" strokeWidth={1.75} />
            <span>로그아웃</span>
          </button>
        </div>
      ) : null}

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 outline-none transition-colors",
          "hover:bg-surface-2",
          "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
          "active:bg-surface-2",
          (open || active) && "bg-surface",
        )}
      >
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
            {currentUser.avatarInitials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-foreground">
            {currentUser.name}
          </p>
          <p className="truncate text-[11px] text-muted-2 group-hover:text-muted">
            계정 설정
          </p>
        </div>
        <Settings className="h-4 w-4 shrink-0 text-muted-2 transition-colors group-hover:text-foreground" />
      </button>
    </div>
  );
}
