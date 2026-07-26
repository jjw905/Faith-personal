"use client";

import { useSession } from "next-auth/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { readDataRetentionDaysFromStorage } from "@/lib/data-retention";
import { WORKSPACES, type Workspace, type WorkspaceId } from "@/lib/workspaces";
import type { User } from "@/types/user";

const AUTO_TIMELINE_KEY = "faith.settings.autoOpenTimelineOnStart";
const WORKSPACE_KEY = "faith.workspaceId";
const ACTIVE_TEAM_KEY = "faith.activeTeamId";

interface AppContextValue {
  currentUser: User;
  notificationCount: number;
  workspaceId: WorkspaceId;
  workspace: Workspace;
  setWorkspaceId: (id: WorkspaceId) => void;
  activeTeamId: string | null;
  setActiveTeamId: (id: string | null) => void;
  autoOpenTimelineOnStart: boolean;
  setAutoOpenTimelineOnStart: (value: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function initialsFrom(name: string, email: string) {
  const base = (name || email || "?").trim();
  return base.slice(0, 1).toUpperCase() || "?";
}

function sessionToUser(sessionUser: {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string;
  plan?: string;
}): User {
  const email = sessionUser.email ?? "";
  const name =
    sessionUser.name?.trim() ||
    (email.includes("@") ? email.split("@")[0]! : "사용자");
  const isAdmin = sessionUser.role === "ADMIN";
  const roleLabel = isAdmin ? "관리자" : "사용자";
  const tier = isAdmin ? "ADMIN" : sessionUser.plan === "PRO" ? "PRO" : "FREE";
  return {
    id: sessionUser.id,
    name,
    email,
    role: roleLabel,
    tier,
    rbacLevel: isAdmin ? 3 : 1,
    avatarInitials: initialsFrom(name, email),
  };
}

function readAutoTimelinePref(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(AUTO_TIMELINE_KEY);
    if (raw === null) return true;
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

function readWorkspaceId(): WorkspaceId {
  if (typeof window === "undefined") return "personal";
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEY);
    if (raw === "personal" || raw === "team") return raw;
  } catch {
    /* ignore */
  }
  return "personal";
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const [notificationCount, setNotificationCount] = useState(0);
  const [workspaceId, setWorkspaceIdState] = useState<WorkspaceId>("personal");
  const [activeTeamId, setActiveTeamIdState] = useState<string | null>(null);
  const [autoOpenTimelineOnStart, setAutoOpenTimelineOnStartState] =
    useState(true);

  useEffect(() => {
    queueMicrotask(() => {
      setWorkspaceIdState(readWorkspaceId());
      setActiveTeamIdState(window.localStorage.getItem(ACTIVE_TEAM_KEY));
      setAutoOpenTimelineOnStartState(readAutoTimelinePref());
    });
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) {
      queueMicrotask(() => setNotificationCount(0));
      return;
    }

    let cancelled = false;
    async function refreshCount() {
      try {
        const retentionDays = readDataRetentionDaysFromStorage();
        const q = new URLSearchParams({
          countOnly: "1",
          retentionDays: String(retentionDays),
        });
        const res = await fetch(`/api/notifications?${q}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          unreadCount?: number;
        };
        if (!cancelled && res.ok && data.ok) {
          setNotificationCount(data.unreadCount ?? 0);
        }
      } catch {
        // ignore
      }
    }

    void refreshCount();
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ unreadCount?: number }>).detail;
      if (typeof detail?.unreadCount === "number") {
        setNotificationCount(detail.unreadCount);
        return;
      }
      void refreshCount();
    };
    window.addEventListener("faith:notifications-changed", onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("faith:notifications-changed", onChanged);
    };
  }, [session?.user?.id, status]);

  const setWorkspaceId = useCallback((id: WorkspaceId) => {
    setWorkspaceIdState(id);
    try {
      window.localStorage.setItem(WORKSPACE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const setAutoOpenTimelineOnStart = useCallback((value: boolean) => {
    setAutoOpenTimelineOnStartState(value);
    try {
      window.localStorage.setItem(AUTO_TIMELINE_KEY, value ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const setActiveTeamId = useCallback((id: string | null) => {
    setActiveTeamIdState(id);
    try {
      if (id) window.localStorage.setItem(ACTIVE_TEAM_KEY, id);
      else window.localStorage.removeItem(ACTIVE_TEAM_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const sessionUser = session?.user;
  const currentUser = useMemo(() => {
    if (sessionUser?.id) {
      return sessionToUser(sessionUser);
    }
    return {
      id: "",
      name: "게스트",
      email: "",
      role: "사용자",
      tier: "FREE",
      rbacLevel: 0,
      avatarInitials: "?",
    } satisfies User;
  }, [sessionUser]);

  const value = useMemo<AppContextValue>(() => {
    const workspace =
      WORKSPACES.find((w) => w.id === workspaceId) ?? WORKSPACES[1];

    return {
      currentUser,
      notificationCount,
      workspaceId,
      workspace,
      setWorkspaceId,
      activeTeamId,
      setActiveTeamId,
      autoOpenTimelineOnStart,
      setAutoOpenTimelineOnStart,
    };
  }, [
    currentUser,
    notificationCount,
    workspaceId,
    setWorkspaceId,
    activeTeamId,
    setActiveTeamId,
    autoOpenTimelineOnStart,
    setAutoOpenTimelineOnStart,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error("useAppContext must be used within AppProvider");
  }

  return context;
}
