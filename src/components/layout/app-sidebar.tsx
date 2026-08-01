"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Bell,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Gift,
  Plus,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarUsage } from "@/components/layout/sidebar-usage";
import { UserProfile } from "@/components/layout/user-profile";
import { useAppContext } from "@/context/app-context";
import { useNotificationsUi } from "@/context/notifications-ui-context";
import {
  TEAM_PREVIEW_ROLE_LABEL,
  useTeamRolePreview,
} from "@/context/team-role-preview-context";
import { clientGet } from "@/lib/client-fetch";
import {
  APP_NAME,
  DEV_NAV_ITEMS,
  NAV_ITEMS,
  OPS_NAV_ITEMS,
  type NavItem,
} from "@/lib/constants";
import {
  DEMAND_SURVEY_ACTIVE,
  TEAM_FEATURE_ADMIN_ONLY,
  TEAM_FEATURE_ENABLED,
} from "@/lib/feature-flags";
import { SURVEY_COMPLETED_EVENT } from "@/lib/stt/survey";
import { cn } from "@/lib/utils";
import { isMeetingsRoute, isTeamRoute } from "@/lib/workspace-route";

const SIDEBAR_COLLAPSED_KEY = "faith.sidebar.collapsed";
const SIDEBAR_OPS_OPEN_KEY = "faith.sidebar.opsOpen";
const SIDEBAR_DEV_OPEN_KEY = "faith.sidebar.devOpen";

interface AppSidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function isNavActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return isMeetingsRoute(pathname);
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

function sectionHasActive(pathname: string, items: NavItem[]) {
  return items.some((item) => isNavActive(pathname, item.href));
}

function readStoredOpen(key: string, fallback = true): boolean {
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "1";
  } catch {
    return fallback;
  }
}

function writeStoredOpen(key: string, open: boolean) {
  try {
    window.localStorage.setItem(key, open ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function AdminNavSection({
  label,
  open,
  onToggle,
  items,
  pathname,
  onNavigate,
  rail,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
  rail: boolean;
}) {
  return (
    <div className="mt-5">
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? `${label} 접기` : `${label} 펼치기`}
        onClick={onToggle}
        className={cn(
          "flex min-h-12 w-full cursor-pointer items-center gap-1 rounded-xl px-3 text-sm font-semibold tracking-wide text-muted-2 outline-none transition-colors",
          "hover:bg-surface-2 hover:text-foreground",
          "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
          rail && "lg:sr-only",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        )}
      </button>
      {open ? (
        <div className="space-y-0.5">
          {items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={isNavActive(pathname, item.href)}
              onNavigate={onNavigate}
              collapsed={rail}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NavLink({
  item,
  active,
  onNavigate,
  collapsed = false,
  trailing = null,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
  trailing?: ReactNode;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={item.title}
      className={cn(
        "group relative flex cursor-pointer items-center gap-2.5 rounded-xl py-2.5 text-base font-medium outline-none transition-colors",
        "hover:bg-surface-2 hover:text-foreground",
        "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
        "active:bg-surface-2",
        active ? "bg-surface text-foreground" : "text-muted",
        collapsed ? "justify-center px-2" : "px-3",
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5 shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-2 group-hover:text-foreground",
        )}
      />
      <span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>
        {item.title}
      </span>
      {!collapsed && trailing ? (
        <span className="inline-flex shrink-0 items-center">{trailing}</span>
      ) : null}
      {collapsed && trailing ? (
        <span className="absolute right-1 top-1 inline-flex items-center">
          {trailing}
        </span>
      ) : null}
      {!collapsed && item.badge ? (
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
  collapsed = false,
  teamEnabled,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
  teamEnabled: boolean;
}) {
  const { workspaceId, setWorkspaceId, activeTeamId, setActiveTeamId } =
    useAppContext();
  const { resolveRole, isPreviewing, previewRole } = useTeamRolePreview();
  const meetingsActive = isMeetingsRoute(pathname);
  const teamRouteActive = isTeamRoute(pathname);
  const sectionActive = meetingsActive || teamRouteActive;
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [teams, setTeams] = useState<
    Array<
      {
        id: string;
        name: string;
        role: "OWNER" | "ADMIN" | "MEMBER";
      }
    >
  >([]);
  const open = userOpen ?? true;
  const Icon = item.icon;
  const activeTeamIdRef = useRef(activeTeamId);
  activeTeamIdRef.current = activeTeamId;
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;
  const teamRouteActiveRef = useRef(teamRouteActive);
  teamRouteActiveRef.current = teamRouteActive;

  useEffect(() => {
    if (!teamEnabled) return;
    let cancelled = false;

    async function loadTeams() {
      try {
        const response = await clientGet("/api/teams");
        const data = (await response.json()) as {
          ok?: boolean;
          teams?: Array<{
            id: string;
            name: string;
            role: "OWNER" | "ADMIN" | "MEMBER";
            canInvite: boolean;
            canCreateMeeting: boolean;
            canManageRecordAccess: boolean;
          }>;
        };
        if (cancelled || !response.ok || !data.ok) return;

        const nextTeams = data.teams ?? [];
        setTeams(nextTeams);
        if (!nextTeams.some((team) => team.id === activeTeamIdRef.current)) {
          setActiveTeamId(nextTeams[0]?.id ?? null);
        }
        if (
          nextTeams.length === 0 &&
          workspaceIdRef.current === "team" &&
          !teamRouteActiveRef.current
        ) {
          setWorkspaceId("personal");
        }
      } catch {
        if (!cancelled) setTeams([]);
      }
    }

    void loadTeams();
    return () => {
      cancelled = true;
    };
  }, [setActiveTeamId, setWorkspaceId, teamEnabled]);

  if (collapsed) {
    return (
      <Link
        href={item.href}
        onClick={() => onNavigate?.()}
        title={item.title}
        className={cn(
          "group flex cursor-pointer items-center justify-center rounded-xl px-2 py-2.5 outline-none transition-colors",
          "hover:bg-surface-2 hover:text-foreground",
          "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
          sectionActive ? "bg-surface text-foreground" : "text-muted",
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
        <span className="sr-only">{item.title}</span>
      </Link>
    );
  }

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
          <li>
            {!teamEnabled ? (
              <span
                aria-disabled="true"
                title={
                  TEAM_FEATURE_ENABLED && TEAM_FEATURE_ADMIN_ONLY
                    ? "팀 기능은 관리자에게만 제공됩니다"
                      : "팀 설정은 현재 준비 중입니다"
                }
                className="flex min-h-12 cursor-not-allowed items-center gap-2 rounded-lg px-2 text-sm font-semibold text-muted-2 opacity-50"
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-muted-2">
                  <UsersRound className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <span className="flex-1">
                  {TEAM_FEATURE_ENABLED && TEAM_FEATURE_ADMIN_ONLY
                    ? "팀, 관리자 전용"
                    : "팀"}
                </span>
              </span>
            ) : teams.length === 0 ? (
              <Link
                href="/team"
                onClick={() => {
                  setWorkspaceId("team");
                  onNavigate?.();
                }}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-semibold transition-colors",
                  "hover:bg-surface-2 hover:text-foreground",
                  workspaceId === "team" && teamRouteActive
                    ? "bg-primary-soft text-primary"
                    : "text-muted-2",
                )}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full bg-primary-soft text-primary">
                  <Plus className="h-4 w-4" strokeWidth={2} />
                </span>
                <span>팀</span>
              </Link>
            ) : (
              <ul className="space-y-0.5">
                {teams.map((team) => {
                  const teamContextActive =
                    activeTeamId === team.id &&
                    workspaceId === "team" &&
                    (meetingsActive || teamRouteActive);
                  const teamActive = teamContextActive && pathname === "/team";
                  const viewRole =
                    activeTeamId === team.id
                      ? resolveRole(team.role)
                      : team.role;

                  return (
                    <li key={team.id}>
                      <Link
                        href="/team"
                        onClick={() => {
                          setWorkspaceId("team");
                          setActiveTeamId(team.id);
                          onNavigate?.();
                        }}
                        className={cn(
                          "flex min-h-12 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                          "hover:bg-surface-2 hover:text-foreground",
                          teamActive
                            ? "bg-primary-soft font-medium text-primary"
                            : teamContextActive
                              ? "font-medium text-foreground"
                              : "font-normal text-muted-2",
                        )}
                      >
                        <UsersRound
                          className={cn(
                            "h-4 w-4 shrink-0",
                            teamActive || teamContextActive
                              ? "text-primary"
                              : "text-muted-2",
                          )}
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{team.name}</span>
                          {viewRole === "MEMBER" ||
                          (isPreviewing &&
                            activeTeamId === team.id &&
                            previewRole) ? (
                            <span className="block truncate text-sm font-normal text-muted-2">
                              {TEAM_PREVIEW_ROLE_LABEL[viewRole]}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
          <li>
            {(() => {
              const wsActive = workspaceId === "personal" && meetingsActive;

              return (
                <Link
                  href="/dashboard"
                  onClick={() => {
                    setWorkspaceId("personal");
                    onNavigate?.();
                  }}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                    "hover:bg-surface-2 hover:text-foreground",
                    wsActive
                      ? "bg-primary-soft font-medium text-primary"
                      : "font-normal text-muted-2",
                  )}
                >
                  <UserRound
                    className={cn(
                      "h-4 w-4 shrink-0",
                      wsActive ? "text-primary" : "text-muted-2",
                    )}
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">개인</span>
                </Link>
              );
            })()}
          </li>
        </ul>
      ) : null}
    </div>
  );
}

export function AppSidebar({
  mobileOpen = false,
  onMobileClose,
}: AppSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { setWorkspaceId, notificationCount } = useAppContext();
  const { open: notificationsOpen, openNotifications } = useNotificationsUi();
  const isAdmin = session?.user?.role === "ADMIN";
  const teamEnabled =
    TEAM_FEATURE_ENABLED &&
    (!TEAM_FEATURE_ADMIN_ONLY || isAdmin);
  const [collapsed, setCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [surveyGiftAvailable, setSurveyGiftAvailable] = useState(false);
  const [opsOpen, setOpsOpen] = useState(true);
  const [devOpen, setDevOpen] = useState(true);

  useEffect(() => {
    onMobileClose?.();
  }, [pathname, onMobileClose]);

  useEffect(() => {
    if (!DEMAND_SURVEY_ACTIVE || !session?.user?.id) {
      setSurveyGiftAvailable(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/survey", { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; completed?: boolean };
        if (!cancelled && data.ok) setSurveyGiftAvailable(!data.completed);
      } catch {
        if (!cancelled) setSurveyGiftAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, pathname]);

  useEffect(() => {
    function onSurveyCompleted() {
      setSurveyGiftAvailable(false);
    }
    window.addEventListener(SURVEY_COMPLETED_EVENT, onSurveyCompleted);
    return () => {
      window.removeEventListener(SURVEY_COMPLETED_EVENT, onSurveyCompleted);
    };
  }, []);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      setCollapsed(false);
    }
    setOpsOpen(readStoredOpen(SIDEBAR_OPS_OPEN_KEY, true));
    setDevOpen(readStoredOpen(SIDEBAR_DEV_OPEN_KEY, true));
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function toggleOpsOpen() {
    setOpsOpen((current) => {
      const next = !current;
      writeStoredOpen(SIDEBAR_OPS_OPEN_KEY, next);
      return next;
    });
  }

  function toggleDevOpen() {
    setDevOpen((current) => {
      const next = !current;
      writeStoredOpen(SIDEBAR_DEV_OPEN_KEY, next);
      return next;
    });
  }

  // 모바일 드로어는 항상 펼침, 데스크톱만 레일 모드
  const rail = collapsed && isDesktop;
  const opsSectionOpen =
    opsOpen || sectionHasActive(pathname, OPS_NAV_ITEMS);
  const devSectionOpen =
    devOpen || sectionHasActive(pathname, DEV_NAV_ITEMS);

  return (
    <>
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-card",
          "fixed inset-y-0 left-0 z-50 h-dvh transition-[width,transform] duration-200 ease-out",
          "lg:static lg:inset-auto lg:h-full lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          rail ? "w-60 lg:w-[4.5rem]" : "w-60",
        )}
      >
        <div
          className={cn(
            "flex h-16 shrink-0 items-center gap-1 px-3",
            rail ? "justify-between lg:justify-center lg:px-2" : "justify-between",
          )}
        >
          <Link
            href="/dashboard"
            onClick={() => {
              setWorkspaceId("personal");
              onMobileClose?.();
            }}
            className={cn(
              "min-w-0 cursor-pointer text-xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-70",
              rail && "lg:hidden",
            )}
          >
            {APP_NAME}
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-10 w-10 shrink-0 text-muted hover:bg-surface-2 hover:text-foreground",
              "hidden lg:inline-flex",
            )}
            aria-label={rail ? "메뉴 펼치기" : "메뉴 접기"}
            aria-expanded={!rail}
            onClick={toggleCollapsed}
          >
            {rail ? (
              <ChevronsRight className="h-5 w-5" strokeWidth={1.75} />
            ) : (
              <ChevronsLeft className="h-5 w-5" strokeWidth={1.75} />
            )}
          </Button>
        </div>

        <nav
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-2",
            rail ? "px-3 lg:px-2" : "px-3",
          )}
        >
          <div className="space-y-0.5">
            {NAV_ITEMS.map((item) =>
              item.href === "/dashboard" ? (
                <MeetingsNav
                  key={item.href}
                  item={item}
                  pathname={pathname}
                  onNavigate={onMobileClose}
                  collapsed={rail}
                  teamEnabled={teamEnabled}
                />
              ) : (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isNavActive(pathname, item.href)}
                  onNavigate={onMobileClose}
                  collapsed={rail}
                  trailing={
                    item.href === "/plan" && surveyGiftAvailable ? (
                      <Gift
                        className={cn(
                          "text-primary",
                          rail ? "h-3.5 w-3.5" : "h-4 w-4",
                        )}
                        strokeWidth={1.75}
                        aria-label="설문 선물 가능"
                      />
                    ) : null
                  }
                />
              ),
            )}
          </div>

          <SidebarUsage
            collapsed={rail}
            onNavigate={onMobileClose}
          />

          {isAdmin ? (
            <>
              <AdminNavSection
                label="운영"
                open={opsSectionOpen}
                onToggle={toggleOpsOpen}
                items={OPS_NAV_ITEMS}
                pathname={pathname}
                onNavigate={onMobileClose}
                rail={rail}
              />
              <AdminNavSection
                label="개발자"
                open={devSectionOpen}
                onToggle={toggleDevOpen}
                items={DEV_NAV_ITEMS}
                pathname={pathname}
                onNavigate={onMobileClose}
                rail={rail}
              />
            </>
          ) : null}
        </nav>

        <div className={cn("shrink-0 space-y-1 p-3", rail && "lg:px-2")}>
          <button
            type="button"
            title="알림 센터"
            aria-label="알림 센터"
            aria-expanded={notificationsOpen}
            onClick={() => {
              onMobileClose?.();
              openNotifications();
            }}
            className={cn(
              "group flex w-full cursor-pointer items-center gap-2.5 rounded-xl py-2.5 text-base font-medium text-muted outline-none transition-colors",
              "hover:bg-surface-2 hover:text-foreground",
              "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
              "active:bg-surface-2",
              notificationsOpen ? "bg-surface text-foreground" : "text-muted",
              rail ? "justify-center px-2" : "px-3",
            )}
          >
            <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
              <Bell
                className={cn(
                  "h-5 w-5 transition-colors",
                  notificationsOpen
                    ? "text-primary"
                    : "text-muted-2 group-hover:text-foreground",
                )}
                strokeWidth={1.75}
                aria-hidden
              />
              {notificationCount > 0 ? (
                <span
                  className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card"
                  aria-hidden
                />
              ) : null}
            </span>
            <span className={cn("min-w-0 flex-1 truncate text-left", rail && "sr-only")}>
              알림
            </span>
            {!rail && notificationCount > 0 ? (
              <Badge
                variant="sidebar"
                className="min-w-5 justify-center px-1.5 py-0 text-xs"
              >
                {notificationCount}
              </Badge>
            ) : null}
          </button>
          <UserProfile onNavigate={onMobileClose} compact={rail} />
        </div>
      </aside>
    </>
  );
}
