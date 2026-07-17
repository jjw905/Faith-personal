"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { UserProfile } from "@/components/layout/user-profile";
import { APP_NAME, DEV_NAV_ITEMS, NAV_ITEMS, type NavItem } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function isNavActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/meetings") {
    return (
      pathname === "/meetings" ||
      (pathname.startsWith("/meetings/") &&
        !pathname.startsWith("/meetings/live-mask"))
    );
  }
  if (href === "/meetings/live-mask") {
    return pathname.startsWith("/meetings/live-mask");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "group flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition-colors",
        "hover:bg-surface-2 hover:text-foreground",
        "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
        "active:bg-surface-2",
        active ? "bg-surface text-foreground" : "text-muted",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-2 group-hover:text-foreground",
        )}
      />
      <span className="flex-1">{item.title}</span>
      {item.badge ? (
        <Badge
          variant="sidebar"
          className={cn(
            "min-w-5 justify-center px-1.5 py-0 text-[10px]",
            active && "bg-primary-soft text-primary",
          )}
        >
          {item.badge}
        </Badge>
      ) : null}
    </Link>
  );
}

export function AppSidebar({
  mobileOpen = false,
  onMobileClose,
}: AppSidebarProps) {
  const pathname = usePathname();

  useEffect(() => {
    onMobileClose?.();
  }, [pathname, onMobileClose]);

  return (
    <aside
      className={cn(
        "flex w-60 shrink-0 flex-col border-r border-border bg-card",
        "fixed inset-y-0 left-0 z-50 h-dvh transition-transform duration-200 ease-out",
        "lg:static lg:inset-auto lg:h-full lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      )}
    >
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link
          href="/welcome"
          onClick={onMobileClose}
          className="cursor-pointer text-lg font-bold tracking-tight text-foreground transition-opacity hover:opacity-70"
        >
          {APP_NAME}
        </Link>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <div className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isNavActive(pathname, item.href)}
              onNavigate={onMobileClose}
            />
          ))}
        </div>

        <div className="mt-5">
          <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-2">
            개발전용
          </p>
          <div className="space-y-0.5">
            {DEV_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={isNavActive(pathname, item.href)}
                onNavigate={onMobileClose}
              />
            ))}
          </div>
        </div>
      </nav>

      <div className="shrink-0 border-t border-border p-3">
        <UserProfile onNavigate={onMobileClose} />
      </div>
    </aside>
  );
}
