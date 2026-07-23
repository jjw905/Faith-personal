"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pause, Play, Save } from "lucide-react";

import { ProcessingNowSection } from "@/components/dashboard/processing-now";
import { cn } from "@/lib/utils";

const DEMO_LINES = [
  { t: 0, text: "의석을 정돈해 주시기 바랍니다." },
  { t: 5, text: "성원이 되었으므로 위원회를 개회하겠습니다." },
  { t: 12, text: "오늘 안건은 추가경정예산안 심사입니다." },
  { t: 20, text: "소위원장 심사보고를 듣겠습니다." },
  { t: 28, text: "환경부 소관 증액 내역을 말씀드리겠습니다." },
] as const;

export function FeaturePreviewClient() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [draftLines, setDraftLines] = useState<string[]>(() =>
    DEMO_LINES.map((l) => l.text),
  );

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => {
      const t = a.currentTime;
      let idx = 0;
      for (let i = 0; i < DEMO_LINES.length; i++) {
        if (DEMO_LINES[i]!.t <= t) idx = i;
      }
      setCurrent(idx);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, []);

  const activeText = useMemo(
    () => draftLines[current] ?? "",
    [current, draftLines],
  );

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  }

  function jump(i: number) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = DEMO_LINES[i]!.t;
    setCurrent(i);
    void a.play();
  }

  function midSave() {
    const stamp = new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    setSavedAt(stamp);
    try {
      window.localStorage.setItem(
        "faith.preview.midsave",
        JSON.stringify({ at: stamp, lines: draftLines }),
      );
    } catch {
      // ignore
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold tracking-wide text-muted-2">
          로컬 임시 미리보기
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          제작중, 중간저장, 음성+대사
        </h1>
        <p className="text-sm text-muted">
          로그인 시 대시보드{" "}
          <a href="/dashboard" className="font-semibold text-primary underline">
            /dashboard
          </a>
          에서도 제작중 확인. 여기는 로컬 목업.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">1. 제작중</h2>
        <p className="text-xs text-muted">
          기록 시작 아래. 파일명 + 진행 표시. 끝나면 사라짐.
        </p>
        <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-4">
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div className="flex h-16 items-center rounded-2xl bg-primary px-4 text-sm font-semibold text-primary-foreground">
              기록 시작
            </div>
            <div className="flex h-16 items-center rounded-2xl bg-card px-4 text-sm font-semibold shadow-soft">
              파일 올리기
            </div>
          </div>
          <ProcessingNowSection
            demoItems={[
              {
                id: "mtg-preview-processing",
                title: "assembly2-envlabor-20250704",
                status: "transcribing",
                phase: "structuring",
                progressPercent: 72,
                workspace: "personal",
              },
            ]}
          />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">2. 중간 저장</h2>
          <button
            type="button"
            onClick={midSave}
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <Save className="h-4 w-4" strokeWidth={1.75} />
            지금 저장
          </button>
        </div>
        <div className="rounded-2xl bg-card p-4 shadow-soft">
          <p className="mb-3 text-xs text-muted">
            실시간 전사 중 초안을 로컬에 임시 저장하는 목업
            {savedAt ? `, 마지막 저장 ${savedAt}` : ""}
          </p>
          <ul className="space-y-2">
            {draftLines.map((line, i) => (
              <li key={i}>
                <input
                  value={line}
                  onChange={(e) => {
                    const next = [...draftLines];
                    next[i] = e.target.value;
                    setDraftLines(next);
                  }}
                  className="w-full rounded-xl bg-surface px-3 py-2 text-sm text-foreground outline-none ring-1 ring-border focus:ring-primary"
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-foreground">
          3. 음성 + 대사 동기 재생
        </h2>
        <div className="rounded-2xl bg-card p-4 shadow-soft">
          <audio
            ref={audioRef}
            src="/samples/audio/meeting-summary-noise30.wav"
            preload="metadata"
            className="hidden"
          />
          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
              aria-label={playing ? "일시정지" : "재생"}
            >
              {playing ? (
                <Pause className="h-5 w-5" strokeWidth={1.75} />
              ) : (
                <Play className="h-5 w-5" strokeWidth={1.75} />
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-2">현재 줄</p>
              <p className="truncate text-sm font-semibold text-foreground">
                {activeText || "재생을 누르면 대사가 따라갑니다"}
              </p>
            </div>
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {DEMO_LINES.map((line, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => jump(i)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    i === current
                      ? "bg-primary-soft text-foreground"
                      : "hover:bg-surface",
                  )}
                >
                  <span className="w-10 shrink-0 font-mono text-xs tabular-nums text-muted-2">
                    00:{String(line.t).padStart(2, "0")}
                  </span>
                  <span className="text-sm">{draftLines[i]}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Loader2 className="h-3.5 w-3.5" strokeWidth={1.75} />
            샘플 오디오 + 데모 대사 (정답률 검수용 목업)
          </p>
        </div>
      </section>
    </div>
  );
}
