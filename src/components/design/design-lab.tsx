"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  DESIGN_CATEGORIES,
  DESIGN_KIND_LABEL,
  findDesignScene,
} from "@/components/design/design-catalog";
import { DesignFrame } from "@/components/design/design-frame";
import { cn } from "@/lib/utils";

/** 개발전용. 현재 코드의 제품 컴포넌트만 재현. */
export function DesignLab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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

  const { category, scene } = findDesignScene(catId, sceneId);

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

  const Preview = scene.Preview;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <header className="mb-8 sm:mb-10">
        <p className="text-xs font-semibold tracking-wide text-muted-2">
          개발전용
        </p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          디자인
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          현재 코드 기준 제품 UI입니다. 배포본과 다를 수 있습니다.
          모션은 재생으로 다시 볼 수 있습니다.
        </p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <nav
          className="relative z-[100] flex shrink-0 flex-col gap-4 lg:sticky lg:top-4 lg:w-56"
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
                    "inline-flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "bg-card text-foreground shadow-soft"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                  {c.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-1" role="tablist" aria-label="씬">
            <p className="px-1 text-[11px] font-semibold tracking-wide text-muted-2">
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

        <div className="relative z-0 min-w-0 flex-1">
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
