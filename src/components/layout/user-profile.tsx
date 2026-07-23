"use client";

import { LogOut, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppContext } from "@/context/app-context";
import type { AccountTier } from "@/types/user";
import { cn } from "@/lib/utils";

/** 계정 권한 등급 배지. 자극적이지 않은 톤으로 등급만 구분. */
const TIER_BADGE: Record<AccountTier, string> = {
  FREE: "bg-surface-2 text-muted",
  PRO: "bg-primary-soft text-primary",
  ADMIN: "bg-foreground/10 text-foreground",
};

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

export function UserProfile({
  onNavigate,
  forceOpen,
}: {
  onNavigate?: () => void;
  /** 디자인 랩: 메뉴 고정 오픈 */
  forceOpen?: boolean;
}) {
  const { currentUser } = useAppContext();
  const { data: session } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(Boolean(forceOpen));
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const avatarSrc = session?.user?.image?.trim() || null;
  const active =
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/");
  const menuOpen = forceOpen || open;

  useEffect(() => {
    if (!menuOpen || forceOpen) return;
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
  }, [menuOpen, forceOpen]);

  useEffect(() => {
    if (forceOpen) return;
    setOpen(false);
  }, [pathname, forceOpen]);

  return (
    <div ref={rootRef} className="relative">
      {menuOpen ? (
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
                  if (!forceOpen) setOpen(false);
                  onNavigate?.();
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-base outline-none transition-colors",
                  "hover:bg-card",
                  "focus-visible:bg-card",
                  itemActive
                    ? "bg-card font-medium text-foreground"
                    : "text-muted",
                )}
              >
                <Icon
                  className={cn(
                    "h-5 w-5 shrink-0",
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
              if (!forceOpen) setOpen(false);
              void signOut({ callbackUrl: "/login" });
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-base text-muted outline-none transition-colors hover:bg-card hover:text-foreground focus-visible:bg-card"
          >
            <LogOut className="h-5 w-5 shrink-0 text-muted-2" strokeWidth={1.75} />
            <span>로그아웃</span>
          </button>
        </div>
      ) : null}

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => {
          if (forceOpen) return;
          setOpen((v) => !v);
        }}
        className={cn(
          "group flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 outline-none transition-colors",
          "hover:bg-surface-2",
          "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
          "active:bg-surface-2",
          (menuOpen || active) && "bg-surface",
        )}
      >
        <Avatar className="h-8 w-8">
          {avatarSrc ? (
            <AvatarImage src={avatarSrc} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-primary-soft text-sm font-semibold text-primary">
            {currentUser.avatarInitials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-base font-medium text-foreground">
            {currentUser.name}
          </p>
          <span
            className={cn(
              "mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-sm font-semibold tracking-wide",
              TIER_BADGE[currentUser.tier],
            )}
          >
            {currentUser.tier}
          </span>
        </div>
        <Settings className="h-5 w-5 shrink-0 text-muted-2 transition-colors group-hover:text-foreground" />
      </button>
    </div>
  );
}
