"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

export type TeamPreviewRole = "MEMBER" | "ADMIN" | "OWNER";

export const TEAM_PREVIEW_ROLES: TeamPreviewRole[] = [
  "MEMBER",
  "ADMIN",
  "OWNER",
];

export const TEAM_PREVIEW_ROLE_LABEL: Record<TeamPreviewRole, string> = {
  MEMBER: "팀원",
  ADMIN: "팀장",
  OWNER: "팀 대표",
};

type TeamRolePreviewContextValue = {
  enabled: boolean;
  /** 팀 관련 화면에서만 컨트롤 표시 */
  activeOnPage: boolean;
  /** null = 실제 팀 역할 */
  previewRole: TeamPreviewRole | null;
  setPreviewRole: (role: TeamPreviewRole | null) => void;
  /** 미리보기 적용 시 사용할 역할. 비활성/실제면 actual 그대로. */
  resolveRole: (actual: TeamPreviewRole) => TeamPreviewRole;
  isPreviewing: boolean;
};

const TeamRolePreviewContext =
  createContext<TeamRolePreviewContextValue | null>(null);

function isTeamRolePreviewPath(pathname: string) {
  return (
    pathname === "/team" ||
    pathname.startsWith("/team/") ||
    pathname === "/audit" ||
    pathname.startsWith("/audit/") ||
    pathname.startsWith("/meetings/team")
  );
}

const FALLBACK: TeamRolePreviewContextValue = {
  enabled: false,
  activeOnPage: false,
  previewRole: null,
  setPreviewRole: () => undefined,
  resolveRole: (actual) => actual,
  isPreviewing: false,
};

export function TeamRolePreviewProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const enabled = session?.user?.role === "ADMIN";
  const activeOnPage = enabled && isTeamRolePreviewPath(pathname);
  const [previewRole, setPreviewRoleState] = useState<TeamPreviewRole | null>(
    null,
  );

  const setPreviewRole = useCallback((role: TeamPreviewRole | null) => {
    setPreviewRoleState(role);
  }, []);

  const resolveRole = useCallback(
    (actual: TeamPreviewRole) => {
      if (!enabled || !previewRole) return actual;
      return previewRole;
    },
    [enabled, previewRole],
  );

  const value = useMemo<TeamRolePreviewContextValue>(
    () => ({
      enabled,
      activeOnPage,
      previewRole: enabled ? previewRole : null,
      setPreviewRole,
      resolveRole,
      isPreviewing: Boolean(enabled && previewRole),
    }),
    [enabled, activeOnPage, previewRole, setPreviewRole, resolveRole],
  );

  return (
    <TeamRolePreviewContext.Provider value={value}>
      {children}
    </TeamRolePreviewContext.Provider>
  );
}

export function useTeamRolePreview() {
  return useContext(TeamRolePreviewContext) ?? FALLBACK;
}
