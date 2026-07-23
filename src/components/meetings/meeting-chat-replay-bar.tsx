"use client";

import {
  Pause,
  Play,
  Settings2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatPlaybackClock } from "@/lib/transcript-time";
import { cn } from "@/lib/utils";

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5] as const;
const SETTINGS_KEY = "faith.chat-replay.settings";

export type ChatReplaySettings = {
  muted: boolean;
  rate: (typeof SPEED_OPTIONS)[number];
  follow: boolean;
};

const DEFAULT_SETTINGS: ChatReplaySettings = {
  muted: false,
  rate: 1,
  follow: true,
};

function readSettings(): ChatReplaySettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ChatReplaySettings>;
    const rate = SPEED_OPTIONS.includes(parsed.rate as never)
      ? (parsed.rate as ChatReplaySettings["rate"])
      : 1;
    return {
      muted: Boolean(parsed.muted),
      rate,
      follow: parsed.follow !== false,
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

/** M3 스타일 음성+대사 재생 독. 기존 Button/Progress/surface 토큰 사용. */
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
  className?: string;
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const progress = durationSec > 0 ? (currentSec / durationSec) * 100 : 0;

  useEffect(() => {
    if (!settingsOpen) return;
    function onDoc(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSettingsOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  function patch(partial: Partial<ChatReplaySettings>) {
    const next = { ...settings, ...partial };
    onSettingsChange(next);
    writeSettings(next);
  }

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-2xl bg-card px-3 py-3 shadow-soft ring-1 ring-border/60 sm:px-4",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="icon"
          className="h-12 w-12 shrink-0 rounded-2xl"
          onClick={onTogglePlay}
          aria-label={playing ? "일시정지" : "재생"}
        >
          {playing ? (
            <Pause className="h-5 w-5" strokeWidth={1.75} />
          ) : (
            <Play className="h-5 w-5" strokeWidth={1.75} />
          )}
        </Button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-xs font-semibold tracking-wide text-muted-2">
              {audioLabel}
            </p>
            <p className="shrink-0 font-mono text-xs tabular-nums text-muted">
              {formatPlaybackClock(currentSec)}
              <span className="text-muted-2"> / </span>
              {formatPlaybackClock(durationSec)}
            </p>
          </div>
          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {activeLineLabel || "재생하면 대사가 따라갑니다"}
          </p>
          <button
            type="button"
            className="mt-2 block w-full cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            aria-label="재생 위치"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - rect.left) / Math.max(rect.width, 1);
              onSeekRatio(Math.min(1, Math.max(0, ratio)));
            }}
          >
            <Progress value={progress} className="h-2" />
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            aria-label={settings.muted ? "소리 켜기" : "음소거"}
            aria-pressed={settings.muted}
            onClick={() => patch({ muted: !settings.muted })}
          >
            {settings.muted ? (
              <VolumeX className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Volume2 className="h-4 w-4" strokeWidth={1.75} />
            )}
          </Button>
          <div className="relative" ref={panelRef}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-10 w-10",
                settingsOpen && "bg-surface text-foreground",
              )}
              aria-label="재생 설정"
              aria-expanded={settingsOpen}
              aria-controls={panelId}
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <Settings2 className="h-4 w-4" strokeWidth={1.75} />
            </Button>
            {settingsOpen ? (
              <div
                id={panelId}
                role="dialog"
                aria-label="다시듣기 설정"
                className="absolute bottom-[calc(100%+0.5rem)] right-0 z-30 w-[min(18rem,calc(100vw-2.5rem))] rounded-2xl bg-card p-3 shadow-soft ring-1 ring-border"
              >
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-2">
                  재생 설정
                </p>

                <div className="space-y-3">
                  <div>
                    <p className="mb-1.5 text-xs font-semibold text-muted">
                      배속
                    </p>
                    <div
                      role="radiogroup"
                      aria-label="배속"
                      className="grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-0.5"
                    >
                      {SPEED_OPTIONS.map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          role="radio"
                          aria-checked={settings.rate === rate}
                          onClick={() => patch({ rate })}
                          className={cn(
                            "h-8 rounded-[10px] text-xs font-semibold tabular-nums transition-colors",
                            settings.rate === rate
                              ? "bg-card text-foreground shadow-soft"
                              : "text-muted hover:text-foreground",
                          )}
                        >
                          {rate === 1 ? "1x" : `${rate}x`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2.5">
                    <span className="text-sm font-medium text-foreground">
                      대사 따라가기
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.follow}
                      onChange={(e) => patch({ follow: e.target.checked })}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>

                  <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-surface px-3 py-2.5">
                    <span className="text-sm font-medium text-foreground">
                      음소거
                    </span>
                    <input
                      type="checkbox"
                      checked={settings.muted}
                      onChange={(e) => patch({ muted: e.target.checked })}
                      className="h-4 w-4 accent-primary"
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export { readSettings as readChatReplaySettings };
