"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { UserProfile } from "@/components/layout/user-profile";
import { useAppContext } from "@/context/app-context";
import {
  APP_NAME,
  DEV_NAV_ITEMS,
  NAV_ITEMS,
  TEAM_NAV_ITEMS,
  type NavItem,
} from "@/lib/constants";
import { getWorkspaceProfile, WORKSPACES } from "@/lib/workspaces";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function isMeetingsPath(pathname: string) {
  return (
    pathname === "/dashboard" ||
    pathname === "/meetings" ||
    (pathname.startsWith("/meetings/") &&
      !pathname.startsWith("/meetings/live-mask") &&
      !pathname.startsWith("/meetings/new"))
  );
}

function isTeamOnlyPath(pathname: string) {
  return (
    pathname === "/audit" ||
    pathname.startsWith("/audit/") ||
    pathname === "/team" ||
    pathname.startsWith("/team/") ||
    pathname.startsWith("/analysis")
  );
}

function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return isMeetingsPath(pathname);
  }
  if (href === "/meetings/live-mask") {
    return pathname.startsWith("/meetings/live-mask");
  }
  if (href === "/meetings/new") {
    return pathname.startsWith("/meetings/new");
  }
  if (href === "/audit") {
    return pathname === "/audit" || pathname.startsWith("/analysis");
  }
  if (href === "/changelog") {
    return pathname === "/changelog";
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
        "group flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-base font-medium outline-none transition-colors",
        "hover:bg-surface-2 hover:text-foreground",
        "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
        "active:bg-surface-2",
        active ? "bg-surface text-foreground" : "text-muted",
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5 shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-2 group-hover:text-foreground",
        )}
      />
      <span className="flex-1">{item.title}</span>
      {item.badge ? (
        <Badge
          variant="sidebar"
          className={cn(
            "min-w-5 justify-center px-1.5 py-0 text-xs",
            active && "bg-primary-soft text-primary",
          )}
        >
          {item.badge}
        </Badge>
      ) : null}
    </Link>
  );
}

function MeetingsNav({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const { workspaceId, setWorkspaceId } = useAppContext();
  const meetingsActive = isMeetingsPath(pathname);
  const teamOnlyActive = isTeamOnlyPath(pathname);
  const sectionActive = meetingsActive || teamOnlyActive;
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? true;
  const Icon = item.icon;

  useEffect(() => {
    if (teamOnlyActive && workspaceId !== "team") {
      setWorkspaceId("team");
    }
  }, [teamOnlyActive, workspaceId, setWorkspaceId]);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-xl px-1.5 py-0.5",
          sectionActive ? "bg-surface text-foreground" : "text-muted",
        )}
      >
        <Link
          href={item.href}
          onClick={() => {
            onNavigate?.();
          }}
          className={cn(
            "flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-2 text-base font-medium outline-none transition-colors",
            "hover:text-foreground",
            "focus-visible:ring-2 focus-visible:ring-ring",
            sectionActive ? "text-foreground" : "text-muted",
          )}
        >
          <Icon
            className={cn(
              "h-5 w-5 shrink-0",
              sectionActive
                ? "text-primary"
                : "text-muted-2 group-hover:text-foreground",
            )}
          />
          <span className="flex-1 truncate">{item.title}</span>
          {item.badge ? (
            <Badge
              variant="sidebar"
              className={cn(
                "min-w-5 justify-center px-1.5 py-0 text-xs",
                sectionActive && "bg-primary-soft text-primary",
              )}
            >
              {item.badge}
            </Badge>
          ) : null}
        </Link>

        <button
          type="button"
          aria-expanded={open}
          aria-label={open ? "워크스페이스 접기" : "워크스페이스 펼치기"}
          onClick={() => setUserOpen((v) => !(v ?? true))}
          className="flex h-9 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-2 transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          {open ? (
            <ChevronDown className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
          )}
        </button>
      </div>

      {open ? (
        <ul className="mt-0.5 space-y-0.5 border-l border-border ml-5 pl-2">
          {WORKSPACES.map((ws) => {
            const profile = getWorkspaceProfile(ws.id);
            const wsActive =
              workspaceId === ws.id &&
              (ws.id === "team"
                ? meetingsActive || teamOnlyActive
                : meetingsActive);
            const showTeamChildren =
              ws.id === "team" && (workspaceId === "team" || teamOnlyActive);

            return (
              <li key={ws.id}>
                <Link
                  href="/dashboard"
                  onClick={() => {
                    setWorkspaceId(ws.id);
                    onNavigate?.();
                  }}
                  className={cn(
                    "flex cursor-pointer items-start gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    "hover:bg-surface-2 hover:text-foreground",
                    wsActive
                      ? "bg-primary-soft font-medium text-primary"
                      : "font-normal text-muted-2",
                  )}
                >
                  <ChevronRight
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0",
                      wsActive ? "text-primary" : "text-muted-2/80",
                    )}
                    strokeWidth={2}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {profile.title} 워크스페이스
                    </span>
                    <span
                      className={cn(
                        "mt-0.5 block truncate text-sm font-normal leading-snug",
                        wsActive ? "text-primary/75" : "text-muted-2/90",
                      )}
                    >
                      {profile.subtitle}
                    </span>
                  </span>
                </Link>

                {showTeamChildren ? (
                  <ul className="mt-0.5 space-y-0.5 border-l border-border ml-3 pl-2">
                    {TEAM_NAV_ITEMS.map((sub) => {
                      const SubIcon = sub.icon;
                      const subActive = isNavActive(pathname, sub.href);
                      return (
                        <li key={sub.href}>
                          <Link
                            href={sub.href}
                            onClick={() => {
                              setWorkspaceId("team");
                              onNavigate?.();
                            }}
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                              "hover:bg-surface-2 hover:text-foreground",
                              subActive
                                ? "bg-surface font-medium text-foreground"
                                : "font-normal text-muted-2",
                            )}
                          >
                            <SubIcon
                              className={cn(
                                "h-4 w-4 shrink-0",
                                subActive ? "text-primary" : "text-muted-2",
                              )}
                              strokeWidth={1.75}
                            />
                            <span className="truncate">{sub.title}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

/** 개인 워크스페이스에서 팀 전용 URL 접근 시 회의로 보냄. */
function PersonalWorkspaceGuard() {
  const pathname = usePathname();
  const router = useRouter();
  const { workspaceId } = useAppContext();

  useEffect(() => {
    if (workspaceId === "personal" && isTeamOnlyPath(pathname)) {
      router.replace("/dashboard");
    }
  }, [workspaceId, pathname, router]);

  return null;
}

export function AppSidebar({
  mobileOpen = false,
  onMobileClose,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  useEffect(() => {
    onMobileClose?.();
  }, [pathname, onMobileClose]);

  return (
    <>
      <PersonalWorkspaceGuard />
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
            href="/dashboard"
            onClick={onMobileClose}
            className="cursor-pointer text-xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-70"
          >
            {APP_NAME}
          </Link>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) =>
              item.href === "/dashboard" ? (
                <MeetingsNav
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={onMobileClose}
                />
              ) : (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isNavActive(pathname, item.href)}
                  onNavigate={onMobileClose}
                />
              ),
            )}
          </div>

          {isAdmin ? (
            <div className="mt-5">
              <p className="px-3 pb-1.5 text-sm font-semibold tracking-wide text-muted-2">
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
          ) : null}
        </nav>

        <div className="shrink-0 p-3">
          <UserProfile onNavigate={onMobileClose} />
        </div>
      </aside>
    </>
  );
}
