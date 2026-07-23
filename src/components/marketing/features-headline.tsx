"use client";

import Image from "next/image";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";

import { cn } from "@/lib/utils";

/** 이 폭에서 1:1. 좁아지면 블록 전체가 비율 그대로 축소된다. */
const DESIGN_W = 896;
const STORAGE_KEY = "faith.features.headline.pos";

type XY = { x: number; y: number };
type Pos = { title: XY; bubble: XY };
/** 고정 좌표(사용자 확정). 일반 렌더는 항상 이 값 사용, ?edit=1 에서만 드래그. */
const DEFAULT: Pos = { title: { x: 10, y: 60 }, bubble: { x: 46, y: -12 } };

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

function useEditMode() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("edit");
    setOn(q === "1" || q === "features");
  }, []);
  return on;
}

/**
 * 기능 섹션 타이틀 + 말풍선.
 * - DESIGN_W(896) 기준 레이아웃을 통째로 scale — 창 크기와 무관하게 비율 고정.
 * - ?edit=1 이면 드래그로 위치 조절(값은 이 브라우저에 저장, 코드에 옮겨 고정).
 */
export function FeaturesHeadline() {
  const edit = useEditMode();
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [boxH, setBoxH] = useState<number | undefined>(undefined);
  const [pos, setPos] = useState<Pos>(DEFAULT);
  const [ready, setReady] = useState(false);
  const [sel, setSel] = useState<"title" | "bubble">("title");
  const drag = useRef<{
    key: "title" | "bubble";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    setPos(readPos());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !edit) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  }, [pos, ready, edit]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    const measure = () => {
      const s = Math.min(1, wrap.clientWidth / DESIGN_W);
      setScale(s);
      setBoxH(inner.offsetHeight * s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    ro.observe(inner);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!edit) return;
    function onMove(e: globalThis.PointerEvent) {
      const d = drag.current;
      if (!d) return;
      const dx = (e.clientX - d.startX) / (scale || 1);
      const dy = (e.clientY - d.startY) / (scale || 1);
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
  }, [edit, scale]);

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

  // 화살표키 미세조정(선택 요소 1px, Shift+10px)
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

  // 일반 화면은 고정값(DEFAULT), 편집 모드에서만 드래그 중인 pos 사용
  const view = edit ? pos : DEFAULT;
  const snippet = `title: translate(${pos.title.x}px, ${pos.title.y}px)\nbubble: translate(${pos.bubble.x}px, ${pos.bubble.y}px)`;

  return (
    <div
      ref={wrapRef}
      className="relative w-full overflow-x-clip"
      style={{ height: boxH }}
    >
      <div
        ref={innerRef}
        className="absolute left-1/2 top-0 flex flex-col items-center"
        style={{
          width: DESIGN_W,
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        {/* 히어로에서 내려온 세로선 */}
        <div
          aria-hidden
          className="mb-12 h-12 w-px bg-[color-mix(in_srgb,var(--foreground)_16%,transparent)]"
        />

        <div className="grid w-full grid-cols-2 items-start gap-x-10">
          <div
            className={cn(
              "min-w-0 justify-self-end text-left",
              edit &&
                "cursor-grab outline outline-1 outline-dashed active:cursor-grabbing",
              edit && sel === "title"
                ? "outline-2 outline-primary"
                : edit && "outline-primary/40",
            )}
            style={{ transform: `translate(${view.title.x}px, ${view.title.y}px)` }}
            onPointerDown={(e) => startDrag(e, "title")}
          >
            <h2 className="break-keep text-5xl font-bold tracking-tight text-foreground">
              회의 전 과정을
              <br />
              하나의 흐름으로.
            </h2>
            <p className="mt-6 break-keep text-lg leading-relaxed text-muted">
              기록까지 안전하게, Faith가 자동으로 이어줍니다.
            </p>
          </div>

          <div
            className={cn(
              "justify-self-start pt-1",
              edit &&
                "cursor-grab outline outline-1 outline-dashed active:cursor-grabbing",
              edit && sel === "bubble"
                ? "outline-2 outline-primary"
                : edit && "outline-primary/40",
            )}
            style={{
              transform: `translate(${view.bubble.x}px, ${view.bubble.y}px)`,
            }}
            onPointerDown={(e) => startDrag(e, "bubble")}
          >
            <div
              aria-hidden
              className="pointer-events-none relative z-10 w-[15rem] select-none"
            >
              <Image
                src="/hero-chat-glass-01.png"
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

      {edit && ready ? (
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
                    onChange={(e) => setAxis(k, axis, Math.round(Number(e.target.value) || 0))}
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
