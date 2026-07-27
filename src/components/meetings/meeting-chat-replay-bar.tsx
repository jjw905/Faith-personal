"use client";

import {
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { formatPlaybackClock } from "@/lib/transcript-time";
import { cn } from "@/lib/utils";

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
const SETTINGS_KEY = "faith.chat-replay.settings";

export type ChatReplaySettings = {
  muted: boolean;
  /** 0~1 */
  volume: number;
  rate: (typeof SPEED_OPTIONS)[number];
};

const DEFAULT_SETTINGS: ChatReplaySettings = {
  muted: false,
  volume: 1,
  rate: 1,
};

const dockIconBtn =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white/80 transition-[transform,background-color,color,box-shadow] duration-150 ease-out hover:bg-white/12 hover:text-white active:scale-90 motion-reduce:transition-colors motion-reduce:active:scale-100";

const SKIP_SEC = 10;

/** Lucide 회전 + 숫자. 독의 stroke 아이콘 톤에 맞춤. */
function SkipIcon({ dir }: { dir: "back" | "forward" }) {
  const Icon = dir === "back" ? RotateCcw : RotateCw;
  return (
    <span className="relative inline-flex h-8 w-8 items-center justify-center" aria-hidden>
      <Icon className="h-7 w-7" strokeWidth={1.5} />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center pt-px text-[10px] font-bold leading-none tabular-nums tracking-tight">
        {SKIP_SEC}
      </span>
    </span>
  );
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

function readSettings(): ChatReplaySettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ChatReplaySettings>;
    const rate = SPEED_OPTIONS.includes(parsed.rate as never)
      ? (parsed.rate as ChatReplaySettings["rate"])
      : 1;
    const volume =
      typeof parsed.volume === "number" && Number.isFinite(parsed.volume)
        ? clamp01(parsed.volume)
        : 1;
    return {
      muted: Boolean(parsed.muted),
      volume,
      rate,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(next: ChatReplaySettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function ratioFromClientX(el: HTMLElement, clientX: number) {
  const rect = el.getBoundingClientRect();
  return clamp01((clientX - rect.left) / Math.max(rect.width, 1));
}

function ratioFromClientY(el: HTMLElement, clientY: number) {
  const rect = el.getBoundingClientRect();
  // 위가 큼(1), 아래가 0
  return clamp01(1 - (clientY - rect.top) / Math.max(rect.height, 1));
}

/** 재생 위치 게이지 + 현재점 동그라미. 클릭·드래그 seek. (검정 독용) */
function SeekScrubber({
  progress,
  onSeekRatio,
}: {
  progress: number;
  onSeekRatio: (ratio: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [active, setActive] = useState(false);
  const pct = clamp01(progress / 100) * 100;

  function seekFromEvent(clientX: number) {
    const el = trackRef.current;
    if (!el) return;
    onSeekRatio(ratioFromClientX(el, clientX));
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    dragging.current = true;
    setActive(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore invalid pointerId
    }
    seekFromEvent(e.clientX);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    seekFromEvent(e.clientX);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    setActive(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="재생 위치"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="group relative flex min-h-10 w-full cursor-pointer touch-none items-center px-1 outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:min-h-7"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          onSeekRatio(clamp01(pct / 100 - 0.02));
        }
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          onSeekRatio(clamp01(pct / 100 + 0.02));
        }
        if (e.key === "Home") {
          e.preventDefault();
          onSeekRatio(0);
        }
        if (e.key === "End") {
          e.preventDefault();
          onSeekRatio(1);
        }
      }}
    >
      <div
        className={cn(
          "relative w-full rounded-full bg-white/20 transition-[height] duration-150 ease-out md:h-2.5",
          active ? "h-3.5 md:h-3.5" : "h-3 group-hover:h-3.5 md:group-hover:h-3",
        )}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white transition-[width] duration-75 ease-out"
          style={{ width: `${pct}%` }}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-soft ring-[3px] ring-[#111111] transition-transform duration-150 ease-out md:h-4 md:w-4",
            active && "scale-125",
          )}
          style={{ left: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** 세로 음량 게이지. 드래그로 조절. (검정 독용) */
function VolumeTrack({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [active, setActive] = useState(false);
  const pct = clamp01(value) * 100;

  function seekFromEvent(clientY: number) {
    const el = trackRef.current;
    if (!el) return;
    onChange(ratioFromClientY(el, clientY));
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = true;
    setActive(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore invalid pointerId
    }
    seekFromEvent(e.clientY);
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    seekFromEvent(e.clientY);
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    setActive(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-label="음량"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn(
        "group relative flex h-40 w-12 cursor-ns-resize touch-none items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-white/40",
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(e) => {
        const step = 0.05;
        if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
          e.preventDefault();
          onChange(clamp01(value - step));
        }
        if (e.key === "ArrowUp" || e.key === "ArrowRight") {
          e.preventDefault();
          onChange(clamp01(value + step));
        }
        if (e.key === "Home") {
          e.preventDefault();
          onChange(0);
        }
        if (e.key === "End") {
          e.preventDefault();
          onChange(1);
        }
      }}
    >
      <div
        className={cn(
          "relative h-full rounded-full bg-white/20 transition-[width] duration-150 ease-out",
          active ? "w-2.5" : "w-2 group-hover:w-2.5",
        )}
      >
        <div
          className="absolute bottom-0 left-0 right-0 rounded-full bg-white transition-[height] duration-75 ease-out"
          style={{ height: `${pct}%` }}
        />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute left-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-soft ring-2 ring-[#111111] transition-transform duration-150 ease-out",
            active && "scale-125",
          )}
          style={{ top: `${100 - pct}%` }}
        />
      </div>
    </div>
  );
}

function VolumeIcon({
  muted,
  volume,
}: {
  muted: boolean;
  volume: number;
}) {
  if (muted || volume <= 0.001) {
    return <VolumeX className="h-5 w-5 md:h-4 md:w-4" strokeWidth={1.75} />;
  }
  if (volume < 0.45) {
    return <Volume1 className="h-5 w-5 md:h-4 md:w-4" strokeWidth={1.75} />;
  }
  return <Volume2 className="h-5 w-5 md:h-4 md:w-4" strokeWidth={1.75} />;
}

const SPEAKER_PLACEHOLDER = "재생하면 화자가 따라갑니다";

/** 화자 이름만 아래에서 위로 올라오는 노래방식 전환. */
function RisingSpeakerLabel({ name }: { name: string }) {
  const next = name.trim() || SPEAKER_PLACEHOLDER;
  const [current, setCurrent] = useState(next);
  const [outgoing, setOutgoing] = useState<string | null>(null);

  useEffect(() => {
    if (next === current) return;
    setOutgoing(current);
    setCurrent(next);
  }, [next, current]);

  return (
    <div
      className="relative h-5 overflow-hidden md:h-5"
      aria-live="polite"
      aria-atomic="true"
    >
      {outgoing ? (
        <p
          key={`out-${outgoing}`}
          className="replay-speaker-out absolute inset-x-0 top-0 truncate text-sm font-semibold text-white md:text-sm"
          onAnimationEnd={() => setOutgoing(null)}
        >
          {outgoing}
        </p>
      ) : null}
      <p
        key={`in-${current}`}
        className={cn(
          "absolute inset-x-0 top-0 truncate text-sm font-semibold md:text-sm",
          current === SPEAKER_PLACEHOLDER ? "text-white/55" : "text-white",
          outgoing ? "replay-speaker-in" : undefined,
        )}
      >
        {current}
      </p>
    </div>
  );
}

/** M3 스타일 음성+대사 재생 독. */
export function MeetingChatReplayBar({
  audioLabel,
  currentSec,
  durationSec,
  playing,
  activeLineLabel,
  settings,
  onSettingsChange,
  onTogglePlay,
  onSeekRatio,
  onSeekBySec,
  className,
}: {
  audioLabel: string;
  currentSec: number;
  durationSec: number;
  playing: boolean;
  activeLineLabel: string;
  settings: ChatReplaySettings;
  onSettingsChange: (next: ChatReplaySettings) => void;
  onTogglePlay: () => void;
  onSeekRatio: (ratio: number) => void;
  onSeekBySec: (deltaSec: number) => void;
  className?: string;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const panelId = useId();
  const volumePanelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const volumeRef = useRef<HTMLDivElement>(null);
  const progress = durationSec > 0 ? (currentSec / durationSec) * 100 : 0;
  const effectiveMuted = settings.muted || settings.volume <= 0.001;
  const longClock = durationSec >= 3600;
  const clockWidth = longClock ? "min-w-[3.75rem]" : "min-w-[2.5rem]";

  useEffect(() => {
    if (!settingsOpen && !volumeOpen) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (settingsOpen && panelRef.current && !panelRef.current.contains(target)) {
        setSettingsOpen(false);
      }
      if (volumeOpen && volumeRef.current && !volumeRef.current.contains(target)) {
        setVolumeOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSettingsOpen(false);
        setVolumeOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen, volumeOpen]);

  function patch(partial: Partial<ChatReplaySettings>) {
    const next = { ...settings, ...partial };
    onSettingsChange(next);
    writeSettings(next);
  }

  function setVolume(next: number) {
    const volume = clamp01(next);
    patch({
      volume,
      muted: volume <= 0.001 ? true : false,
    });
  }

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-visible rounded-2xl bg-[#111111] px-3 py-2 text-white shadow-soft sm:px-4 sm:py-2.5",
        className,
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-2">
        <div className="flex min-w-0 flex-col justify-center gap-0.5 pr-1">
          <p className="truncate text-sm font-semibold tracking-wide text-white/50 md:text-xs">
            {audioLabel}
          </p>
          <RisingSpeakerLabel name={activeLineLabel} />
        </div>

        <div className="flex items-center justify-center gap-1.5 sm:gap-2">
          <button
            type="button"
            className={dockIconBtn}
            aria-label={`${SKIP_SEC}초 뒤로`}
            onClick={() => onSeekBySec(-SKIP_SEC)}
          >
            <SkipIcon dir="back" />
          </button>
          <button
            type="button"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#111111] shadow-soft transition-[transform,background-color,box-shadow] duration-150 ease-out hover:scale-[1.04] hover:bg-white hover:shadow-float active:scale-95 motion-reduce:transition-colors motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
            onClick={onTogglePlay}
            aria-label={playing ? "일시정지" : "재생"}
          >
            <span
              key={playing ? "pause" : "play"}
              className="inline-flex animate-[fab-item-up_160ms_ease-out] motion-reduce:animate-none"
            >
              {playing ? (
                <Pause className="h-5 w-5" strokeWidth={1.75} />
              ) : (
                <Play className="h-5 w-5" strokeWidth={1.75} />
              )}
            </span>
          </button>
          <button
            type="button"
            className={dockIconBtn}
            aria-label={`${SKIP_SEC}초 앞으로`}
            onClick={() => onSeekBySec(SKIP_SEC)}
          >
            <SkipIcon dir="forward" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-0.5 sm:gap-1">
          <div className="relative shrink-0" ref={volumeRef}>
            <button
              type="button"
              className={cn(dockIconBtn, volumeOpen && "bg-white/18 text-white")}
              aria-label="음량"
              aria-expanded={volumeOpen}
              aria-controls={volumePanelId}
              onClick={() => {
                setSettingsOpen(false);
                setVolumeOpen((v) => !v);
              }}
            >
              <VolumeIcon muted={effectiveMuted} volume={settings.volume} />
            </button>
            {volumeOpen ? (
              <div
                id={volumePanelId}
                role="dialog"
                aria-label="음량 조절"
                className="replay-volume-up absolute bottom-[calc(100%+0.4rem)] left-1/2 z-30 flex w-12 -translate-x-1/2 justify-center rounded-2xl border border-white/15 bg-[#111111] py-3 shadow-float"
              >
                <VolumeTrack
                  value={effectiveMuted ? 0 : settings.volume}
                  onChange={setVolume}
                  className="h-36 w-11"
                />
              </div>
            ) : null}
          </div>

          <div className="relative shrink-0" ref={panelRef}>
            <button
              type="button"
              className={cn(
                dockIconBtn,
                settingsOpen && "bg-white/18 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]",
              )}
              aria-label="재생 설정"
              aria-expanded={settingsOpen}
              aria-controls={panelId}
              onClick={() => {
                setVolumeOpen(false);
                setSettingsOpen((v) => !v);
              }}
            >
              <Settings2
                className={cn(
                  "h-5 w-5 transition-transform duration-200 ease-out",
                  settingsOpen && "rotate-45",
                )}
                strokeWidth={1.75}
              />
            </button>
            {settingsOpen ? (
              <div
                id={panelId}
                role="dialog"
                aria-label="다시듣기 설정"
                className="replay-panel-up absolute bottom-[calc(100%+0.5rem)] right-0 z-30 w-[min(18rem,calc(100vw-2.5rem))] rounded-2xl bg-[#111111] p-3 text-white shadow-float ring-1 ring-white/15"
              >
                <p className="mb-2 text-sm font-semibold tracking-wide text-white/50 md:text-xs">
                  재생 설정
                </p>

                <div>
                  <p className="mb-1.5 text-sm font-semibold text-white/65 md:text-xs">
                    배속
                  </p>
                  <div
                    role="radiogroup"
                    aria-label="배속"
                    className="grid grid-cols-4 gap-1 rounded-xl bg-white/10 p-1"
                  >
                    {SPEED_OPTIONS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        role="radio"
                        aria-checked={settings.rate === rate}
                        onClick={() => patch({ rate })}
                        className={cn(
                          "min-h-12 rounded-[10px] text-base font-semibold tabular-nums transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-95 motion-reduce:active:scale-100 md:min-h-8 md:text-xs",
                          settings.rate === rate
                            ? "bg-white text-[#111111] shadow-soft"
                            : "text-white/60 hover:bg-white/10 hover:text-white",
                        )}
                      >
                        {rate === 1 ? "1x" : `${rate}x`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-0.5 flex min-w-0 items-center justify-center gap-2.5 px-2 sm:mt-1 sm:gap-3.5 sm:px-4 md:gap-4 md:px-6">
        <span
          className={cn(
            "shrink-0 text-right font-mono text-sm tabular-nums leading-none text-white/65 md:text-xs",
            clockWidth,
          )}
          aria-label="현재 시각"
        >
          {formatPlaybackClock(currentSec)}
        </span>
        <div className="min-w-0 flex-1">
          <SeekScrubber progress={progress} onSeekRatio={onSeekRatio} />
        </div>
        <span
          className={cn(
            "shrink-0 text-left font-mono text-sm tabular-nums leading-none text-white/65 md:text-xs",
            clockWidth,
          )}
          aria-label="전체 길이"
        >
          {formatPlaybackClock(durationSec)}
        </span>
      </div>
    </div>
  );
}

export { readSettings as readChatReplaySettings };
