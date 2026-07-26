"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Plus,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserProfile } from "@/components/layout/user-profile";
import { useAppContext } from "@/context/app-context";
import {
  TEAM_PREVIEW_ROLE_LABEL,
  useTeamRolePreview,
} from "@/context/team-role-preview-context";
import { clientGet } from "@/lib/client-fetch";
import {
  APP_NAME,
  DEV_NAV_ITEMS,
  NAV_ITEMS,
  TEAM_NAV_ITEMS,
  type NavItem,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getWorkspaceProfile } from "@/lib/workspaces";

const SIDEBAR_COLLAPSED_KEY = "faith.sidebar.collapsed";

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
  collapsed = false,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.title : undefined}
      className={cn(
        "group flex cursor-pointer items-center gap-2.5 rounded-xl py-2.5 text-base font-medium outline-none transition-colors",
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
      <span className={cn("flex-1 truncate", collapsed && "sr-only")}>
        {item.title}
      </span>
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
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const { workspaceId, setWorkspaceId, activeTeamId, setActiveTeamId } =
    useAppContext();
  const { resolveRole, isPreviewing, previewRole } = useTeamRolePreview();
  const searchParams = useSearchParams();
  const meetingsActive = isMeetingsPath(pathname);
  const teamOnlyActive = isTeamOnlyPath(pathname);
  const sectionActive = meetingsActive || teamOnlyActive;
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const [teams, setTeams] = useState<
    Array<{ id: string; name: string; role: "OWNER" | "ADMIN" | "MEMBER" }>
  >([]);
  const open = userOpen ?? true;
  const Icon = item.icon;
  const activeTeamIdRef = useRef(activeTeamId);
  activeTeamIdRef.current = activeTeamId;
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;
  const teamOnlyActiveRef = useRef(teamOnlyActive);
  teamOnlyActiveRef.current = teamOnlyActive;

  useEffect(() => {
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
          !teamOnlyActiveRef.current
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
  }, [setActiveTeamId, setWorkspaceId]);

  useEffect(() => {
    if (teamOnlyActive && workspaceId !== "team") {
      setWorkspaceId("team");
    }
  }, [teamOnlyActive, workspaceId, setWorkspaceId]);

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
            {teams.length === 0 ? (
              <Link
                href="/team"
                onClick={() => {
                  setWorkspaceId("team");
                  onNavigate?.();
                }}
                className={cn(
                  "flex min-h-12 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm font-semibold transition-colors",
                  "hover:bg-surface-2 hover:text-foreground",
                  workspaceId === "team" && teamOnlyActive
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
                  const manageParam = searchParams.get("manage");
                  const onTeamDashboard = pathname === "/team" && !manageParam;
                  const teamContextActive =
                    activeTeamId === team.id &&
                    workspaceId === "team" &&
                    (meetingsActive || teamOnlyActive);
                  const teamActive = teamContextActive && onTeamDashboard;
                  const viewRole =
                    activeTeamId === team.id
                      ? resolveRole(team.role)
                      : team.role;
                  // 팀 화면(/team, 감사, 팀 회의)에 있을 때만 하위 메뉴 유지.
                  // 개인 워크스페이스·보관함·도움말 등으로 나가면 접는다.
                  const showTeamChildren =
                    activeTeamId === team.id &&
                    viewRole !== "MEMBER" &&
                    (teamOnlyActive ||
                      (workspaceId === "team" &&
                        pathname.startsWith("/meetings/team")));

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
                        <ChevronRight
                          className={cn(
                            "h-3.5 w-3.5 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none",
                            showTeamChildren && "rotate-90",
                            teamActive || teamContextActive || showTeamChildren
                              ? "text-primary"
                              : "text-muted-2/80",
                          )}
                          strokeWidth={2}
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

                      <div
                        className={cn(
                          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
                          showTeamChildren
                            ? "grid-rows-[1fr]"
                            : "grid-rows-[0fr]",
                        )}
                        aria-hidden={!showTeamChildren}
                      >
                        <div className="overflow-hidden">
                          <ul className="mt-0.5 space-y-0.5 border-l border-border ml-3 pl-2">
                            {TEAM_NAV_ITEMS.filter((sub) =>
                              sub.roles.some((role) => role === viewRole),
                            ).map((sub) => {
                              const SubIcon = sub.icon;
                              const [subPath, subQuery] = sub.href.split("?");
                              const subManage = subQuery
                                ? new URLSearchParams(subQuery).get("manage")
                                : null;
                              const subActive =
                                pathname === subPath &&
                                (subManage
                                  ? searchParams.get("manage") === subManage
                                  : !searchParams.get("manage"));
                              return (
                                <li key={sub.href}>
                                  <Link
                                    href={sub.href}
                                    tabIndex={showTeamChildren ? undefined : -1}
                                    onClick={() => {
                                      setWorkspaceId("team");
                                      setActiveTeamId(team.id);
                                      onNavigate?.();
                                    }}
                                    className={cn(
                                      "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                                      "hover:bg-surface-2 hover:text-foreground",
                                      subActive
                                        ? "bg-primary-soft font-medium text-primary"
                                        : "font-normal text-muted-2",
                                    )}
                                  >
                                    <SubIcon
                                      className={cn(
                                        "h-4 w-4 shrink-0",
                                        subActive
                                          ? "text-primary"
                                          : "text-muted-2",
                                      )}
                                      strokeWidth={1.75}
                                    />
                                    <span className="truncate">{sub.title}</span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </li>
          <li>
            {(() => {
              const profile = getWorkspaceProfile("personal");
              const wsActive = workspaceId === "personal" && meetingsActive;

              return (
                <Link
                  href="/dashboard"
                  onClick={() => {
                    setWorkspaceId("personal");
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
  const { setWorkspaceId } = useAppContext();
  const isAdmin = session?.user?.role === "ADMIN";
  const [collapsed, setCollapsed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    onMobileClose?.();
  }, [pathname, onMobileClose]);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      setCollapsed(false);
    }
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

  // 모바일 드로어는 항상 펼침, 데스크톱만 레일 모드
  const rail = collapsed && isDesktop;

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
            "min-h-0 flex-1 overflow-y-auto py-2",
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

          {isAdmin ? (
            <div className="mt-5">
              <p
                className={cn(
                  "px-3 pb-1.5 text-sm font-semibold tracking-wide text-muted-2",
                  rail && "lg:sr-only",
                )}
              >
                개발전용
              </p>
              <div className="space-y-0.5">
                {DEV_NAV_ITEMS.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isNavActive(pathname, item.href)}
                    onNavigate={onMobileClose}
                    collapsed={rail}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </nav>

        <div className={cn("shrink-0 p-3", rail && "lg:px-2")}>
          <UserProfile onNavigate={onMobileClose} compact={rail} />
        </div>
      </aside>
    </>
  );
}
