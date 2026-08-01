"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react";

import { cn } from "@/lib/utils";

const STORAGE_KEY = "faith.features.headline.pos";

type XY = { x: number; y: number };
type Pos = { title: XY; bubble: XY };
/** 고정 좌표. 일반 렌더는 X축 중앙 정렬(레이아웃)을 쓰고, ?edit=1 에서만 드래그. */
const DEFAULT: Pos = { title: { x: 0, y: 0 }, bubble: { x: 0, y: 0 } };

function readPos(): Pos {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw) as Partial<Pos>;
    return {
      title: { x: Number(p.title?.x) || 0, y: Number(p.title?.y) || 0 },
      bubble: { x: Number(p.bubble?.x) || 0, y: Number(p.bubble?.y) || 0 },
    };
  } catch {
    return DEFAULT;
  }
}

/** useSyncExternalStore: getSnapshot은 값이 같으면 동일 참조를 돌려야 한다. */
let posCacheRaw: string | null | undefined;
let posCache: Pos = DEFAULT;

function getPosSnapshot(): Pos {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === posCacheRaw) return posCache;
    posCacheRaw = raw;
    posCache = readPos();
    return posCache;
  } catch {
    return DEFAULT;
  }
}

function subscribePos(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function useEditMode() {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("popstate", onChange);
      return () => window.removeEventListener("popstate", onChange);
    },
    () => {
      const q = new URLSearchParams(window.location.search).get("edit");
      return q === "1" || q === "features";
    },
    () => false,
  );
}

/**
 * 기능 섹션 타이틀 + 말풍선.
 * 일반 화면은 폭과 무관하게 X축 중앙. ?edit=1 이면 드래그로 위치 조절.
 */
export function FeaturesHeadline() {
  const edit = useEditMode();
  const storedPos = useSyncExternalStore(
    subscribePos,
    getPosSnapshot,
    () => DEFAULT,
  );
  const [draft, setDraft] = useState<Pos | null>(null);
  const pos = draft ?? storedPos;
  const setPos = (next: Pos | ((prev: Pos) => Pos)) => {
    setDraft((prev) => {
      const base = prev ?? storedPos;
      return typeof next === "function" ? next(base) : next;
    });
  };
  const [sel, setSel] = useState<"title" | "bubble">("title");
  const drag = useRef<{
    key: "title" | "bubble";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    if (!edit) return;
    const raw = JSON.stringify(pos);
    window.localStorage.setItem(STORAGE_KEY, raw);
    posCacheRaw = raw;
    posCache = pos;
  }, [pos, edit]);

  useEffect(() => {
    if (!edit) return;
    function onMove(e: globalThis.PointerEvent) {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      setPos((p) => ({
        ...p,
        [d.key]: { x: Math.round(d.origX + dx), y: Math.round(d.origY + dy) },
      }));
    }
    function onUp() {
      drag.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [edit]);

  function startDrag(e: PointerEvent<HTMLDivElement>, key: "title" | "bubble") {
    if (!edit) return;
    e.preventDefault();
    setSel(key);
    drag.current = {
      key,
      startX: e.clientX,
      startY: e.clientY,
      origX: pos[key].x,
      origY: pos[key].y,
    };
  }

  useEffect(() => {
    if (!edit) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA"))
        return;
      const map: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const d = map[e.key];
      if (!d) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      setPos((p) => ({
        ...p,
        [sel]: { x: p[sel].x + d[0] * step, y: p[sel].y + d[1] * step },
      }));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit, sel]);

  function setAxis(key: "title" | "bubble", axis: "x" | "y", v: number) {
    setPos((p) => ({ ...p, [key]: { ...p[key], [axis]: v } }));
  }

  const view = edit ? pos : DEFAULT;
  // 일반 화면은 폭과 무관하게 X축 중앙. translate는 편집 모드에서만 적용.
  const applyOffset = edit;
  const snippet = `title: translate(${pos.title.x}px, ${pos.title.y}px)\nbubble: translate(${pos.bubble.x}px, ${pos.bubble.y}px)`;

  return (
    <div className="relative w-full overflow-x-clip">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center">
        <div aria-hidden className="mb-8 h-12 w-px sm:mb-12" />

        <div className="flex w-full flex-col items-center gap-8 text-center sm:gap-10">
          <div
            className={cn(
              "mx-auto min-w-0 max-w-2xl",
              edit &&
                "cursor-grab outline outline-1 outline-dashed active:cursor-grabbing",
              edit && sel === "title"
                ? "outline-2 outline-primary"
                : edit && "outline-primary/40",
            )}
            style={
              applyOffset
                ? { transform: `translate(${view.title.x}px, ${view.title.y}px)` }
                : undefined
            }
            onPointerDown={(e) => startDrag(e, "title")}
          >
            <h2 className="break-keep text-3xl font-bold tracking-tight text-foreground sm:text-4xl xl:text-5xl">
              회의 전 과정을
              <br />
              하나의 흐름으로.
            </h2>
            <p className="mx-auto mt-4 max-w-xl break-keep text-lg leading-relaxed text-muted sm:mt-5 sm:text-xl xl:mt-6 xl:text-2xl">
              받아쓰기부터 요약까지, 회의의 흐름을 자동으로 이어갑니다.
            </p>
          </div>

          <div
            className={cn(
              "mx-auto flex justify-center pt-1",
              edit &&
                "cursor-grab outline outline-1 outline-dashed active:cursor-grabbing",
              edit && sel === "bubble"
                ? "outline-2 outline-primary"
                : edit && "outline-primary/40",
            )}
            style={
              applyOffset
                ? {
                    transform: `translate(${view.bubble.x}px, ${view.bubble.y}px)`,
                  }
                : undefined
            }
            onPointerDown={(e) => startDrag(e, "bubble")}
          >
            <div
              aria-hidden
              className="pointer-events-none relative z-10 w-44 select-none sm:w-52 xl:w-[15rem]"
            >
              <Image
                src="/hero-chat-glass-charcoal.png"
                alt=""
                width={533}
                height={619}
                draggable={false}
                className="hero-chat-glass h-auto w-full"
                priority={false}
              />
            </div>
          </div>
        </div>
      </div>

      {edit ? (
        <div className="fixed bottom-4 right-4 z-[80] w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-3 text-left shadow-lg">
          <p className="text-sm font-semibold text-foreground">위치 조절</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            박스 클릭 후 드래그 · 화살표키(Shift=10px) · 값 직접 입력.
          </p>

          <div className="mt-2 flex gap-1">
            {(["title", "bubble"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSel(k)}
                className={cn(
                  "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium",
                  sel === k
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface-2 text-foreground",
                )}
              >
                {k === "title" ? "타이틀" : "말풍선"}
              </button>
            ))}
          </div>

          {(["title", "bubble"] as const).map((k) => (
            <div key={k} className="mt-2 flex items-center gap-2">
              <span className="w-10 text-xs text-muted">
                {k === "title" ? "타이틀" : "말풍선"}
              </span>
              {(["x", "y"] as const).map((axis) => (
                <label key={axis} className="flex items-center gap-1 text-xs text-muted">
                  {axis}
                  <input
                    type="number"
                    value={pos[k][axis]}
                    onFocus={() => setSel(k)}
                    onChange={(e) =>
                      setAxis(k, axis, Math.round(Number(e.target.value) || 0))
                    }
                    className="w-14 rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-foreground"
                  />
                </label>
              ))}
            </div>
          ))}

          <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-2 text-[11px] leading-relaxed text-foreground">
            {snippet}
          </pre>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
              onClick={() => void navigator.clipboard.writeText(snippet)}
            >
              복사
            </button>
            <button
              type="button"
              className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs font-medium text-foreground"
              onClick={() => setPos(DEFAULT)}
            >
              초기화
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
