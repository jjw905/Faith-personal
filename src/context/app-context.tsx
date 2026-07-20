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

import { getNotifications } from "@/lib/mock-loader";
import {
  WORKSPACES,
  type Workspace,
  type WorkspaceId,
} from "@/lib/workspaces";
import type { User } from "@/types/user";

const AUTO_TIMELINE_KEY = "faith.settings.autoOpenTimelineOnStart";
const WORKSPACE_KEY = "faith.workspaceId";

interface AppContextValue {
  currentUser: User;
  notificationCount: number;
  workspaceId: WorkspaceId;
  workspace: Workspace;
  setWorkspaceId: (id: WorkspaceId) => void;
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
  if (typeof window === "undefined") return "team";
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEY);
    if (raw === "personal" || raw === "team") return raw;
  } catch {
    /* ignore */
  }
  return "team";
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const unread = getNotifications().filter((n) => n.unread).length;
  const [workspaceId, setWorkspaceIdState] = useState<WorkspaceId>("team");
  const [autoOpenTimelineOnStart, setAutoOpenTimelineOnStartState] =
    useState(true);

  useEffect(() => {
    setWorkspaceIdState(readWorkspaceId());
    setAutoOpenTimelineOnStartState(readAutoTimelinePref());
  }, []);

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

  const currentUser = useMemo(() => {
    if (session?.user?.id) {
      return sessionToUser(session.user);
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
  }, [session?.user]);

  const value = useMemo<AppContextValue>(() => {
    const workspace =
      WORKSPACES.find((w) => w.id === workspaceId) ?? WORKSPACES[1];

    return {
      currentUser,
      notificationCount: unread,
      workspaceId,
      workspace,
      setWorkspaceId,
      autoOpenTimelineOnStart,
      setAutoOpenTimelineOnStart,
    };
  }, [
    currentUser,
    unread,
    workspaceId,
    setWorkspaceId,
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
