"use client";

import {
  Check,
  Copy,
  LogOut,
  Settings,
  UserRound,
  UserRoundPlus,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { clientGet } from "@/lib/client-fetch";
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
  compact = false,
}: {
  onNavigate?: () => void;
  /** 디자인 랩: 메뉴 고정 오픈 */
  forceOpen?: boolean;
  /** 사이드바 접힘: 아바타만 */
  compact?: boolean;
}) {
  const { currentUser } = useAppContext();
  const { scenarioId } = usePageUxPreview();
  const { data: session } = useSession();
  const pathname = usePathname();
  const previewForceOpen = forceOpen || scenarioId === "popup-account";
  const [open, setOpen] = useState(Boolean(previewForceOpen));
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();
  const avatarSrc = session?.user?.image?.trim() || null;
  const active =
    pathname === "/account" ||
    pathname.startsWith("/account/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/");
  const menuOpen = previewForceOpen || open;

  useEffect(() => {
    setOpen(scenarioId === "popup-account");
  }, [scenarioId]);

  useEffect(() => {
    if (!menuOpen || previewForceOpen) return;
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
  }, [menuOpen, previewForceOpen]);

  useEffect(() => {
    if (previewForceOpen) return;
    queueMicrotask(() => setOpen(false));
  }, [pathname, previewForceOpen]);

  useEffect(
    () => () => {
      if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void clientGet("/api/teams")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as {
          identity?: { inviteCode?: string | null };
        };
      })
      .then((payload) => {
        if (active) setInviteCode(payload?.identity?.inviteCode ?? null);
      })
      .catch(() => {
        if (active) setInviteCode(null);
      });
    return () => {
      active = false;
    };
  }, []);

  async function copyInviteCode() {
    if (!inviteCode) return;
    let didCopy = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(inviteCode);
        didCopy = true;
      }
    } catch {
      didCopy = false;
    }
    if (!didCopy) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = inviteCode;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        textarea.remove();
        if (!ok) throw new Error("COPY_FAILED");
        didCopy = true;
      } catch {
        didCopy = false;
      }
    }
    if (didCopy) {
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 1600);
    } else {
      setCopied(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse" || previewForceOpen) return;
        if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current);
        setOpen(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse" || previewForceOpen) return;
        hoverCloseTimer.current = setTimeout(() => setOpen(false), 120);
      }}
    >
      <div
        className={cn(
          "absolute z-50 shrink-0",
          // 모바일 드로어: 계정 버튼 위로
          "bottom-full left-0 right-0 mb-0",
          // 데스크톱 사이드바: 계정 버튼 오른쪽
          "lg:bottom-0 lg:left-full lg:right-auto lg:mb-0 lg:ml-1.5 lg:w-max lg:origin-left",
          "transition-[opacity,transform,visibility] duration-200 ease-out motion-reduce:transition-none",
          menuOpen
            ? "visible translate-y-0 opacity-100 lg:translate-x-0"
            : "invisible pointer-events-none translate-y-1 opacity-0 lg:translate-x-[-0.5rem] lg:translate-y-0 lg:scale-[0.98]",
        )}
      >
        <div className="relative">
        <div
          id={menuId}
          role="menu"
          aria-label="계정 메뉴"
          aria-hidden={!menuOpen}
          className="w-full overflow-hidden rounded-lg bg-surface shadow-float ring-1 ring-border-strong lg:w-max lg:shrink-0"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!inviteCode}
            onClick={() => void copyInviteCode()}
            className="relative flex w-full cursor-pointer items-center gap-2 py-2 pl-2.5 pr-5 text-sm whitespace-nowrap text-muted outline-none transition-colors hover:bg-card hover:text-foreground focus-visible:bg-card disabled:cursor-wait disabled:opacity-60"
          >
            <UserRoundPlus
              className="h-4 w-4 shrink-0 text-muted-2"
              strokeWidth={1.75}
            />
            <span className="truncate text-left">초대 코드</span>
            <Copy className="h-3.5 w-3.5 shrink-0 text-muted-2" aria-hidden />
            <span
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute right-2 -top-8 z-10 flex items-center gap-1 rounded-full bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-background shadow-float transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none lg:hidden",
                copied
                  ? "visible translate-y-0 opacity-100"
                  : "invisible translate-y-1 opacity-0",
              )}
            >
              <Check className="h-3 w-3" aria-hidden />
              복사되었습니다.
            </span>
          </button>
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
                  if (!previewForceOpen) setOpen(false);
                  onNavigate?.();
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-2 py-2 pl-2.5 pr-5 text-sm whitespace-nowrap outline-none transition-colors",
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
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              if (!previewForceOpen) setOpen(false);
              void signOut({ callbackUrl: "/login" });
            }}
            className="flex w-full cursor-pointer items-center gap-2 py-2 pl-2.5 pr-5 text-sm whitespace-nowrap text-muted outline-none transition-colors hover:bg-card hover:text-foreground focus-visible:bg-card"
          >
            <LogOut
              className="h-4 w-4 shrink-0 text-muted-2"
              strokeWidth={1.75}
            />
            <span className="truncate">로그아웃</span>
          </button>
        </div>

        <div
          aria-live="polite"
          className={cn(
            "pointer-events-none absolute top-1.5 left-full z-10 ml-1.5 hidden items-center gap-1 rounded-full bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-background shadow-float transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none lg:flex",
            copied
              ? "visible translate-x-0 opacity-100"
              : "invisible -translate-x-1 opacity-0",
          )}
        >
          <Check className="h-3 w-3" aria-hidden />
          복사되었습니다.
        </div>
        </div>
      </div>

      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={() => {
          if (previewForceOpen) return;
          setOpen((v) => !v);
        }}
        title={compact ? currentUser.name : undefined}
        className={cn(
          "group flex w-full cursor-pointer items-center rounded-xl outline-none transition-colors",
          "hover:bg-surface-2",
          "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
          "active:bg-surface-2",
          (menuOpen || active) && "bg-surface",
          compact ? "justify-center px-2 py-2.5" : "gap-2.5 px-3 py-2.5",
        )}
      >
        <Avatar className="h-8 w-8 shrink-0">
          {avatarSrc ? (
            <AvatarImage src={avatarSrc} alt="" className="object-cover" />
          ) : null}
          <AvatarFallback className="bg-primary-soft text-sm font-semibold text-primary">
            {currentUser.avatarInitials}
          </AvatarFallback>
        </Avatar>
        <div className={cn("min-w-0 flex-1 text-left", compact && "sr-only")}>
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
        {!compact ? (
          <Settings className="h-5 w-5 shrink-0 text-muted-2 transition-colors group-hover:text-foreground" />
        ) : null}
      </button>
    </div>
  );
}
