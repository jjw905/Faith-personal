"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  DESIGN_CATEGORIES,
  DESIGN_KIND_LABEL,
  findDesignScene,
} from "@/components/design/design-catalog";
import { DesignFrame } from "@/components/design/design-frame";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { cn } from "@/lib/utils";

/** 개발전용. 현재 코드의 제품 컴포넌트만 재현. */
export function DesignLab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    enabled: uxEnabled,
    supported: uxSupported,
    surface: uxSurface,
    scenarioId: uxScenarioId,
    isLive: uxLive,
  } = usePageUxPreview();

  const initial = findDesignScene(
    searchParams.get("cat"),
    searchParams.get("scene"),
  );
  const [catId, setCatId] = useState(initial.category.id);
  const [sceneId, setSceneId] = useState(initial.scene.id);

  useEffect(() => {
    const c = searchParams.get("cat");
    const s = searchParams.get("scene");
    if (c) setCatId(c);
    if (s) setSceneId(s);
  }, [searchParams]);

  const select = useCallback(
    (nextCat: string, nextScene: string) => {
      setCatId(nextCat);
      setSceneId(nextScene);
      const q = new URLSearchParams();
      q.set("cat", nextCat);
      q.set("scene", nextScene);
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

  /** 상단 UX 미리보기 컨트롤 → 인증 씬 동기화. */
  useEffect(() => {
    if (!uxEnabled || !uxSupported || uxSurface.id !== "design.auth") return;
    if (uxLive) return;
    if (catId === "auth" && sceneId === uxScenarioId) return;
    select("auth", uxScenarioId);
  }, [
    uxEnabled,
    uxSupported,
    uxSurface.id,
    uxLive,
    uxScenarioId,
    catId,
    sceneId,
    select,
  ]);

  const { category, scene } = findDesignScene(catId, sceneId);

  const Preview = scene.Preview;

  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* NN/g: 모바일 크롬 최소화 (content-to-chrome). */}
      <header className="mb-3 sm:mb-8 lg:mb-10">
        <p className="text-sm font-semibold tracking-wide text-muted-2">
          개발전용
        </p>
        <h1 className="mt-0.5 text-xl font-bold tracking-tight text-foreground sm:mt-1.5 sm:text-3xl lg:text-4xl">
          디자인
        </h1>
        <p className="mt-1.5 hidden max-w-xl text-base leading-relaxed text-muted sm:mt-2 sm:block">
          현재 코드 기준 제품 UI입니다. 배포본과 다를 수 있습니다.
          모션은 재생으로 다시 볼 수 있습니다.
        </p>
      </header>

      {/* 모바일: 미리보기 우선(order), 씬 목록은 접기. 데스크톱: 사이드 내비. */}
      <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-start">
        <nav
          className="relative z-0 order-2 flex shrink-0 flex-col gap-3 lg:order-1 lg:sticky lg:top-4 lg:z-10 lg:w-56 lg:gap-4"
          aria-label="디자인 카탈로그"
        >
          <div
            className="flex flex-wrap gap-1 rounded-2xl bg-surface p-1.5 lg:flex-col"
            role="tablist"
            aria-label="카테고리"
          >
            {DESIGN_CATEGORIES.map((c) => {
              const Icon = c.icon;
              const active = c.id === category.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => select(c.id, c.scenes[0]!.id)}
                  className={cn(
                    "inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-base font-semibold transition-colors lg:min-h-0 lg:text-sm",
                    active
                      ? "bg-card text-foreground shadow-soft"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0 lg:h-4 lg:w-4" strokeWidth={1.75} />
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* 모바일: 씬을 details로 접어 미리보기 높이 확보 (MD3/NN/g chrome↓). */}
          <details className="group rounded-2xl bg-surface open:bg-surface lg:hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-base font-semibold text-foreground [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 truncate">
                <span className="text-muted">씬, </span>
                {scene.label}
              </span>
              <span className="shrink-0 text-sm text-muted group-open:hidden">
                펼치기
              </span>
              <span className="hidden shrink-0 text-sm text-muted group-open:inline">
                접기
              </span>
            </summary>
            <div className="space-y-1 border-t border-border px-1.5 py-2" role="tablist" aria-label="씬">
              {category.scenes.map((s) => {
                const active = s.id === scene.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => select(category.id, s.id)}
                    className={cn(
                      "flex w-full min-h-12 cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-base font-semibold transition-colors",
                      active
                        ? "bg-primary-soft text-foreground"
                        : "text-muted hover:bg-card hover:text-foreground",
                    )}
                  >
                    <span className="min-w-0 truncate">{s.label}</span>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-semibold",
                        s.kind === "popup" ? "text-muted" : "text-primary",
                      )}
                    >
                      {DESIGN_KIND_LABEL[s.kind]}
                    </span>
                  </button>
                );
              })}
            </div>
          </details>

          <div className="hidden space-y-1 lg:block" role="tablist" aria-label="씬">
            <p className="px-1 text-sm font-semibold tracking-wide text-muted-2">
              씬
            </p>
            {category.scenes.map((s) => {
              const active = s.id === scene.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => select(category.id, s.id)}
                  className={cn(
                    "flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors",
                    active
                      ? "bg-primary-soft text-foreground"
                      : "text-muted hover:bg-surface hover:text-foreground",
                  )}
                >
                  <span className="min-w-0 truncate">{s.label}</span>
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-semibold",
                      s.kind === "popup" ? "text-muted" : "text-primary",
                    )}
                  >
                    {DESIGN_KIND_LABEL[s.kind]}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="relative z-10 order-1 min-w-0 flex-1 lg:order-2">
          <DesignFrame
            route={scene.route}
            kind={scene.kind}
            trigger={scene.trigger}
          >
            <Preview key={`${category.id}:${scene.id}`} />
          </DesignFrame>
        </div>
      </div>
    </div>
  );
}
