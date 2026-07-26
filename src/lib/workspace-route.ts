import type { WorkspaceId } from "@/lib/workspaces";

/**
 * 팀 컨텍스트가 경로로 확정되는 화면.
 * 이 경로에서는 워크스페이스가 팀이어야 하며, 사용자가 개인을 선택하면 경로를 함께 떠난다.
 */
export function isTeamRoute(pathname: string) {
  return (
    pathname === "/team" ||
    pathname.startsWith("/team/") ||
    pathname === "/audit" ||
    pathname.startsWith("/audit/") ||
    pathname.startsWith("/analysis") ||
    pathname.startsWith("/meetings/team")
  );
}

/** 회의 목록, 회의 상세처럼 워크스페이스에 따라 내용이 갈리는 화면. */
export function isMeetingsRoute(pathname: string) {
  return (
    pathname === "/dashboard" ||
    pathname === "/meetings" ||
    (pathname.startsWith("/meetings/") &&
      !pathname.startsWith("/meetings/live-mask") &&
      !pathname.startsWith("/meetings/new"))
  );
}

/** 경로만으로 워크스페이스가 확정되면 그 값, 아니면 null(사용자 선택 유지). */
export function routeWorkspaceId(pathname: string): WorkspaceId | null {
  return isTeamRoute(pathname) ? "team" : null;
}
