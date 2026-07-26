"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";

import {
  DEFAULT_PAGE_UX_SCENARIOS,
  PAGE_UX_LIVE_SCENARIO,
  pageUxPreviewSupported,
  resolvePageUxSurface,
  type PageUxScenario,
  type PageUxSurface,
} from "@/lib/page-ux-registry";

export type { PageUxScenario, PageUxSurface };

type PageUxPreviewContextValue = {
  enabled: boolean;
  supported: boolean;
  surface: PageUxSurface;
  scenarios: PageUxScenario[];
  scenarioId: string;
  scenario: PageUxScenario;
  index: number;
  next: () => void;
  prev: () => void;
  isLive: boolean;
};

const PageUxPreviewContext = createContext<PageUxPreviewContextValue | null>(
  null,
);

const FALLBACK_VALUE: PageUxPreviewContextValue = {
  enabled: false,
  supported: false,
  surface: { id: "none", label: "", scenarios: DEFAULT_PAGE_UX_SCENARIOS },
  scenarios: DEFAULT_PAGE_UX_SCENARIOS,
  scenarioId: "live",
  scenario: PAGE_UX_LIVE_SCENARIO,
  index: 0,
  next: () => undefined,
  prev: () => undefined,
  isLive: true,
};

function PageUxPreviewProviderInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const enabled = session?.user?.role === "ADMIN";

  const search = searchParams.toString();
  const surface = useMemo(
    () => resolvePageUxSurface(pathname, search ? `?${search}` : ""),
    [pathname, search],
  );
  const supported = pageUxPreviewSupported(surface);
  const scenarios = surface.scenarios;

  /** 화면별 마지막 시나리오 기억 (경로 왕복 시 유지). */
  const memoryRef = useRef<Map<string, string>>(new Map());
  const [tick, setTick] = useState(0);

  const scenarioId = useMemo(() => {
    void tick;
    const remembered = memoryRef.current.get(surface.id);
    if (remembered && scenarios.some((s) => s.id === remembered)) {
      return remembered;
    }
    return scenarios[0]?.id ?? "live";
  }, [surface.id, scenarios, tick]);

  const index = Math.max(
    0,
    scenarios.findIndex((s) => s.id === scenarioId),
  );
  const scenario = scenarios[index] ?? PAGE_UX_LIVE_SCENARIO;

  const setScenarioForSurface = useCallback(
    (id: string) => {
      memoryRef.current.set(surface.id, id);
      setTick((n) => n + 1);
    },
    [surface.id],
  );

  const next = useCallback(() => {
    if (scenarios.length <= 1) return;
    const i = scenarios.findIndex((s) => s.id === scenarioId);
    const nextIndex = (i + 1 + scenarios.length) % scenarios.length;
    setScenarioForSurface(scenarios[nextIndex]!.id);
  }, [scenarioId, scenarios, setScenarioForSurface]);

  const prev = useCallback(() => {
    if (scenarios.length <= 1) return;
    const i = scenarios.findIndex((s) => s.id === scenarioId);
    const prevIndex = (i - 1 + scenarios.length) % scenarios.length;
    setScenarioForSurface(scenarios[prevIndex]!.id);
  }, [scenarioId, scenarios, setScenarioForSurface]);

  const value = useMemo<PageUxPreviewContextValue>(
    () => ({
      enabled,
      supported,
      surface,
      scenarios,
      scenarioId: scenario.id,
      scenario,
      index,
      next,
      prev,
      isLive: scenario.id === "live",
    }),
    [
      enabled,
      supported,
      surface,
      scenarios,
      scenario,
      index,
      next,
      prev,
    ],
  );

  return (
    <PageUxPreviewContext.Provider value={value}>
      {children}
    </PageUxPreviewContext.Provider>
  );
}

export function PageUxPreviewProvider({ children }: { children: ReactNode }) {
  return (
    <PageUxPreviewProviderInner>{children}</PageUxPreviewProviderInner>
  );
}

export function usePageUxPreview() {
  const ctx = useContext(PageUxPreviewContext);
  return ctx ?? FALLBACK_VALUE;
}

export { DEFAULT_PAGE_UX_SCENARIOS };
