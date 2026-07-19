"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import usersData from "@/mocks/users.json";
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
  /** 회의(녹음) 시작 시 타임라인을 열린 상태로 시작 */
  autoOpenTimelineOnStart: boolean;
  setAutoOpenTimelineOnStart: (value: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

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

  const value = useMemo<AppContextValue>(() => {
    const workspace =
      WORKSPACES.find((w) => w.id === workspaceId) ?? WORKSPACES[1];

    return {
      currentUser: usersData.currentUser as User,
      notificationCount: unread,
      workspaceId,
      workspace,
      setWorkspaceId,
      autoOpenTimelineOnStart,
      setAutoOpenTimelineOnStart,
    };
  }, [
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
