"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Bell,
  Building2,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarUsage } from "@/components/layout/sidebar-usage";
import {
  RAIL_ICON_CELL,
  RailHoverCaption,
} from "@/components/layout/rail-hover-caption";
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
  TEAM_FEATURE_ADMIN_ONLY,
  TEAM_FEATURE_ENABLED,
} from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import {
  nextCollapsedAfterPinToggle,
  resolveSidebarVisual,
  SIDEBAR_RAIL_MIN_WIDTH_PX,
} from "@/lib/sidebar-layout";
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

function readStoredOpen(key: string, fallback = false): boolean {
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
          "hover:text-foreground",
          "focus-visible:ring-2 focus-visible:ring-ring",
          rail && "sr-only",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none",
            open ? "rotate-0" : "-rotate-90",
          )}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div
            className="space-y-0.5"
            inert={!open ? true : undefined}
            aria-hidden={!open}
          >
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
        </div>
      </div>
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
      aria-label={item.title}
      className={cn(
        "flex cursor-pointer items-center rounded-xl text-base font-medium outline-none transition-colors",
        "hover:bg-surface-2 hover:text-foreground",
        "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
        "active:bg-surface-2",
        active ? "bg-surface text-foreground" : "text-muted",
        collapsed
          ? RAIL_ICON_CELL
          : "gap-2.5 px-3 py-2.5",
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5 shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-2 group-hover:text-foreground",
        )}
      />
      {collapsed ? (
        <>
          <span className="sr-only">{item.title}</span>
          <RailHoverCaption>{item.title}</RailHoverCaption>
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
      )}
      {!collapsed && trailing ? (
        <span className="inline-flex shrink-0 items-center">{trailing}</span>
      ) : null}
      {collapsed && trailing ? (
        <span className="absolute right-0.5 top-0.5 inline-flex items-center">
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

function PersonalNav({
  item,
  pathname,
  onNavigate,
  collapsed = false,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const { workspaceId, setWorkspaceId } = useAppContext();
  const meetingsActive = isMeetingsRoute(pathname);
  const active = workspaceId === "personal" && meetingsActive;
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={() => {
        setWorkspaceId("personal");
        onNavigate?.();
      }}
      aria-label={item.title}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex cursor-pointer items-center rounded-xl text-base font-medium outline-none transition-colors",
        "hover:bg-surface-2 hover:text-foreground",
        "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
        "active:bg-surface-2",
        active ? "bg-surface text-foreground" : "text-muted",
        collapsed ? RAIL_ICON_CELL : "gap-2.5 px-3 py-2.5",
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5 shrink-0 transition-colors",
          active ? "text-primary" : "text-muted-2 group-hover:text-foreground",
        )}
      />
      {collapsed ? (
        <>
          <span className="sr-only">{item.title}</span>
          <RailHoverCaption>{item.title}</RailHoverCaption>
        </>
      ) : (
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
      )}
    </Link>
  );
}

function TeamNav({
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
  const sectionActive =
    workspaceId === "team" && (meetingsActive || teamRouteActive);
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [teams, setTeams] = useState<
    Array<{
      id: string;
      name: string;
      role: "OWNER" | "ADMIN" | "MEMBER";
    }>
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
    if (!teamEnabled) {
      return (
        <span
          aria-disabled="true"
          title={
            TEAM_FEATURE_ENABLED && TEAM_FEATURE_ADMIN_ONLY
              ? "팀 기능은 관리자에게만 제공됩니다"
              : "팀 설정은 현재 준비 중입니다"
          }
          className={cn(RAIL_ICON_CELL, "cursor-not-allowed opacity-50")}
        >
          <Icon className="h-5 w-5 shrink-0 text-muted-2" />
          <span className="sr-only">{item.title}</span>
          <RailHoverCaption>{item.title}</RailHoverCaption>
        </span>
      );
    }
    return (
      <Link
        href={item.href}
        onClick={() => {
          setWorkspaceId("team");
          onNavigate?.();
        }}
        aria-label={item.title}
        aria-current={sectionActive ? "page" : undefined}
        className={cn(
          RAIL_ICON_CELL,
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
        <RailHoverCaption>{item.title}</RailHoverCaption>
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
        {!teamEnabled ? (
          <span
            aria-disabled="true"
            title={
              TEAM_FEATURE_ENABLED && TEAM_FEATURE_ADMIN_ONLY
                ? "팀 기능은 관리자에게만 제공됩니다"
                : "팀 설정은 현재 준비 중입니다"
            }
            className="flex min-w-0 flex-1 cursor-not-allowed items-center gap-2.5 rounded-lg px-1.5 py-2 text-base font-medium text-muted-2 opacity-50"
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="flex-1 truncate">
              {TEAM_FEATURE_ENABLED && TEAM_FEATURE_ADMIN_ONLY
                ? "팀, 관리자 전용"
                : item.title}
            </span>
          </span>
        ) : (
          <Link
            href={item.href}
            onClick={() => {
              setWorkspaceId("team");
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
          </Link>
        )}

        {teamEnabled && teams.length > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? "팀 목록 접기" : "팀 목록 펼치기"}
            onClick={() => setUserOpen((v) => !(v ?? true))}
            className="flex h-9 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-2 transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            {open ? (
              <ChevronDown className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
            )}
          </button>
        ) : null}
      </div>

      {teamEnabled && open && teams.length === 0 ? (
        <ul className="mt-0.5 space-y-0.5 border-l border-border ml-5 pl-2">
          <li>
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
              <span>팀 만들기</span>
            </Link>
          </li>
        </ul>
      ) : null}

      {teamEnabled && open && teams.length > 0 ? (
        <ul className="mt-0.5 space-y-0.5 border-l border-border ml-5 pl-2">
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
                  <Building2
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
  // true = 레일(아이콘) 선호. 펼침은 상단 핀만.
  const [collapsed, setCollapsed] = useState(true);
  const [isRailLayout, setIsRailLayout] = useState(false);
  const [opsOpen, setOpsOpen] = useState(false);
  const [devOpen, setDevOpen] = useState(false);

  useEffect(() => {
    onMobileClose?.();
  }, [pathname, onMobileClose]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
      // 미설정이면 Cloudflare식 기본: 레일(접힘)
      setCollapsed(stored === null ? true : stored === "1");
    } catch {
      setCollapsed(true);
    }
    setOpsOpen(readStoredOpen(SIDEBAR_OPS_OPEN_KEY, false));
    setDevOpen(readStoredOpen(SIDEBAR_DEV_OPEN_KEY, false));
  }, []);

  useEffect(() => {
    const railMq = window.matchMedia(
      `(min-width: ${SIDEBAR_RAIL_MIN_WIDTH_PX}px)`,
    );
    const sync = () => setIsRailLayout(railMq.matches);
    sync();
    railMq.addEventListener("change", sync);
    return () => railMq.removeEventListener("change", sync);
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = nextCollapsedAfterPinToggle(current);
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

  const visual = resolveSidebarVisual({
    isRailLayout,
    collapsed,
  });
  // rail = 아이콘만 보이는 시각 상태 (모바일 드로어는 항상 펼침 크롬)
  const rail = isRailLayout && !visual.showExpandedChrome;
  const inFlowExpanded = visual.inFlowExpanded;
  const opsSectionOpen =
    opsOpen || sectionHasActive(pathname, OPS_NAV_ITEMS);
  const devSectionOpen =
    devOpen || sectionHasActive(pathname, DEV_NAV_ITEMS);

  return (
    <>
      {/* rail: 레일 슬롯만 예약. pinned: aside 자체가 in-flow w-60 */}
      {visual.contentOffset === "rail" ? (
        <div
          className="relative hidden h-full w-[4.5rem] shrink-0 md:block"
          aria-hidden
          data-sidebar-offset="rail"
        />
      ) : null}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-card",
          "fixed inset-y-0 left-0 z-50 h-dvh w-60",
          "transition-[width,transform,box-shadow] duration-200 ease-out",
          // 모바일(< md): 햄버거 드로어. md+: 항상 보이며 레일/핀.
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          isRailLayout &&
            inFlowExpanded &&
            "md:static md:inset-auto md:h-full md:w-60 md:shadow-none",
          isRailLayout &&
            !inFlowExpanded &&
            "md:absolute md:inset-y-0 md:left-0 md:h-full md:w-[4.5rem] md:shadow-none",
        )}
        data-sidebar-mode={visual.mode}
        data-sidebar-offset={visual.contentOffset}
      >
        {/* 핀 헤더 — md+ 펼침/접음은 이 버튼만. 모바일은 햄버거 드로어. */}
        <div
          className={cn(
            "flex h-16 shrink-0 items-center",
            rail ? "justify-center px-0" : "justify-between gap-1 px-3",
          )}
          data-sidebar-zone="pin"
        >
          <Link
            href="/dashboard"
            onClick={() => {
              setWorkspaceId("personal");
              onMobileClose?.();
            }}
            className={cn(
              "min-w-0 cursor-pointer text-xl font-bold tracking-tight text-foreground transition-opacity hover:opacity-70",
              rail && "hidden",
            )}
          >
            {APP_NAME}
          </Link>
          {!isRailLayout ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ml-auto h-12 w-12 shrink-0 text-muted hover:bg-surface-2 hover:text-foreground md:hidden"
              aria-label="메뉴 닫기"
              onClick={() => onMobileClose?.()}
            >
              <X className="h-5 w-5" strokeWidth={1.75} />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-12 w-12 shrink-0 text-muted hover:bg-surface-2 hover:text-foreground",
                "hidden md:inline-flex",
              )}
              aria-label={
                collapsed ? "메뉴 고정 펼치기" : "메뉴 고정 해제"
              }
              aria-expanded={!collapsed}
              aria-pressed={!collapsed}
              title={
                collapsed
                  ? "메뉴 펼침 고정"
                  : "고정 해제 · 아이콘 레일"
              }
              data-sidebar-zone="pin"
              onClick={(event) => {
                event.stopPropagation();
                toggleCollapsed();
              }}
            >
              {collapsed ? (
                <ChevronsRight className="h-5 w-5" strokeWidth={1.75} />
              ) : (
                <ChevronsLeft className="h-5 w-5" strokeWidth={1.75} />
              )}
            </Button>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col" data-sidebar-zone="nav">
          <nav
            className={cn(
              "min-h-0 flex-1 overscroll-y-contain py-2",
              rail
                ? "overflow-x-visible overflow-y-auto px-0 pb-8"
                : "overflow-y-auto px-3",
            )}
          >
            <div className="space-y-0.5">
              {NAV_ITEMS.map((item) =>
                item.href === "/dashboard" ? (
                  <PersonalNav
                    key={item.href}
                    item={item}
                    pathname={pathname}
                    onNavigate={onMobileClose}
                    collapsed={rail}
                  />
                ) : item.href === "/team" ? (
                  <TeamNav
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
                  label="개발"
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

          <div
            className={cn("shrink-0 space-y-1", rail ? "px-0 py-3" : "p-3")}
          >
            <button
              type="button"
              aria-label="알림 센터"
              aria-expanded={notificationsOpen}
              onClick={() => {
                onMobileClose?.();
                openNotifications();
              }}
              className={cn(
                "text-base font-medium text-muted outline-none transition-colors",
                "hover:bg-surface-2 hover:text-foreground",
                "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
                "active:bg-surface-2",
                notificationsOpen ? "bg-surface text-foreground" : "text-muted",
                rail
                  ? RAIL_ICON_CELL
                  : "flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5",
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
              {rail ? (
                <RailHoverCaption placement="above">알림</RailHoverCaption>
              ) : null}
              {!rail ? (
                <>
                  <span className="min-w-0 flex-1 truncate text-left">알림</span>
                  {notificationCount > 0 ? (
                    <Badge
                      variant="sidebar"
                      className="min-w-5 justify-center px-1.5 py-0 text-xs"
                    >
                      {notificationCount}
                    </Badge>
                  ) : null}
                </>
              ) : null}
            </button>
            <UserProfile onNavigate={onMobileClose} compact={rail} />
          </div>
        </div>
      </aside>
    </>
  );
}
