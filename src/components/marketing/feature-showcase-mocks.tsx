"use client";

import {
  CheckCircle2,
  Lock,
  ShieldCheck,
  StickyNote,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

/**
 * 기능 소개 데모 재생 규칙
 * - 뷰포트에 들어오면 1회만 재생 (IntersectionObserver + unobserve)
 * - 끝나면 마지막 장면 고정, 스크롤로 다시 들어와도 재시작 안 함
 * - 새로고침(리마운트) 시 다시 재생
 * - prefers-reduced-motion이면 마지막 장면만 표시
 *
 * 단계 간격은 원래 값의 92%로, 흐름은 유지하면서 약간 빠르게 재생한다.
 */
const SHOWCASE_PHASE_FACTOR = 0.92;

function useShowcasePlayOnce(
  phaseCount: number,
  phaseMs: number,
  ref: React.RefObject<HTMLElement | null>,
) {
  const reduced = usePrefersReducedMotion();
  const [phase, setPhase] = useState(-1);
  const startedRef = useRef(false);

  useEffect(() => {
    if (reduced) {
      ref.current?.setAttribute("data-showcase-done", "1");
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setPhase(phaseCount - 1);
      el?.setAttribute("data-showcase-done", "1");
      return;
    }

    let timer: number | null = null;
    let cancelled = false;
    const phaseDelay = Math.max(1, Math.round(phaseMs * SHOWCASE_PHASE_FACTOR));

    function advance(i: number) {
      if (cancelled) return;
      setPhase(i);
      if (i >= phaseCount - 1) {
        el?.setAttribute("data-showcase-done", "1");
        return;
      }
      timer = window.setTimeout(() => advance(i + 1), phaseDelay);
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || startedRef.current) return;
        startedRef.current = true;
        io.unobserve(entry.target);
        advance(0);
      },
      { threshold: 0.28 },
    );
    io.observe(el);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      io.disconnect();
    };
  }, [reduced, phaseCount, phaseMs, ref]);

  return reduced ? phaseCount - 1 : phase;
}

const MOCK_CARD =
  "w-full rounded-2xl bg-white p-5 shadow-soft ring-1 ring-border/50 sm:p-6";

function SpeakerAvatar({
  label,
  tone,
}: {
  label: string;
  tone: "primary" | "muted";
}) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-semibold",
        tone === "primary"
          ? "bg-primary text-primary-foreground"
          : "bg-surface-2 text-foreground",
      )}
    >
      {label.slice(0, 1)}
    </span>
  );
}

/** STEP 01 — ~9초: 말풍선 4개가 차례로 쌓임 */
export function MockLiveTranscribe() {
  const ref = useRef<HTMLDivElement>(null);
  const lines = [
    {
      speaker: "김민수",
      initial: "김",
      time: "00:12",
      text: "다음 안건은 예산 승인 건입니다.",
      mine: false,
    },
    {
      speaker: "이서준",
      initial: "이",
      time: "00:18",
      text: "네, 초안은 어제 공유드렸습니다.",
      mine: true,
    },
    {
      speaker: "김민수",
      initial: "김",
      time: "00:24",
      text: "검토 기한은 이번 주 금요일로 둘까요?",
      mine: false,
    },
    {
      speaker: "이서준",
      initial: "이",
      time: "00:31",
      text: "좋습니다. 회의록은 Faith에 남겨둘게요.",
      mine: true,
    },
  ];
  // 0..3 말풍선 등장, 4 = 마지막 홀드 장면. phase < 0 은 아직 시작 전.
  const phase = useShowcasePlayOnce(5, 2200, ref);
  const visibleCount = phase < 0 ? 0 : Math.min(phase + 1, lines.length);
  const started = phase >= 0;
  const recording = started && phase < lines.length;
  const finished = phase >= lines.length;

  return (
    <div ref={ref} className={MOCK_CARD} data-showcase="live">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {recording ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-masked opacity-60" />
          ) : null}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              recording ? "bg-masked" : finished ? "bg-primary" : "bg-border-strong",
            )}
          />
        </span>
        <span className="text-base font-semibold text-muted">
          {finished ? "기록 완료" : recording ? "회의 기록 중" : "회의 기록"}
        </span>
        {recording ? (
          <span className="record-beat-bars ml-auto text-muted-2">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
        ) : finished ? (
          <span className="ml-auto inline-flex items-center gap-1 text-base font-semibold text-primary">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
            대화 4턴
          </span>
        ) : null}
      </div>
      <div className="mt-5 space-y-3.5">
        {lines.map((line, i) => (
          <div
            key={`${line.time}-${line.text}`}
            className={cn(
              "flex gap-2.5 transition-all duration-700 motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none",
              line.mine ? "flex-row-reverse" : "flex-row",
              i < visibleCount
                ? "translate-y-0 opacity-100"
                : "translate-y-2 opacity-0",
            )}
          >
            <SpeakerAvatar
              label={line.initial}
              tone={line.mine ? "primary" : "muted"}
            />
            <div className="min-w-0 max-w-[85%]">
              <p
                className={cn(
                  "mb-1.5 flex items-baseline gap-1.5 text-base font-semibold",
                  line.mine
                    ? "flex-row-reverse text-primary"
                    : "text-foreground",
                )}
              >
                <span>{line.speaker}</span>
                <span className="font-mono text-sm font-medium tabular-nums text-muted">
                  {line.time}
                </span>
              </p>
              <div
                className={cn(
                  "inline-block rounded-2xl px-3.5 py-2.5 text-left text-[15px] font-medium leading-relaxed",
                  line.mine
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "rounded-bl-md bg-surface text-foreground ring-1 ring-border",
                )}
              >
                {line.text}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** STEP 04 — ~8초: 대화 → 스캔 → 마스킹 → 완료 */
export function MockAutoMask() {
  const ref = useRef<HTMLDivElement>(null);
  // 0 첫 말풍선, 1 연락처 말풍선(원문), 2 스캔, 3 마스킹, 4 완료 홀드
  const phase = useShowcasePlayOnce(5, 2000, ref);
  const showSecond = phase >= 1;
  const scanning = phase === 2;
  const masked = phase >= 3;
  const done = phase >= 4;

  return (
    <div ref={ref} className={MOCK_CARD} data-showcase="mask">
      <div className="flex items-center gap-2 text-base font-semibold text-muted">
        <ShieldCheck className="h-4 w-4" strokeWidth={2} />
        개인정보 자동 감지
      </div>
      <div className="mt-5 space-y-4">
        <div
          className={cn(
            "flex gap-2.5 transition-all duration-700 motion-reduce:opacity-100 motion-reduce:transition-none",
            phase >= 0 ? "opacity-100" : "opacity-0",
          )}
        >
          <SpeakerAvatar label="이" tone="primary" />
          <div className="min-w-0">
            <p className="mb-1.5 flex flex-row-reverse items-baseline gap-1.5 text-base font-semibold text-primary">
              <span>이서준</span>
              <span className="font-mono text-sm font-medium tabular-nums text-muted">
                08:04
              </span>
            </p>
            <div className="inline-block rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[15px] font-medium leading-relaxed text-primary-foreground">
              담당자 연락처 한 번만 확인해 주세요.
            </div>
          </div>
        </div>

        <div
          className={cn(
            "flex gap-2.5 transition-all duration-700 motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none",
            showSecond ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
        >
          <SpeakerAvatar label="김" tone="muted" />
          <div className="min-w-0">
            <p className="mb-1.5 flex items-baseline gap-1.5 text-base font-semibold text-foreground">
              <span>김민수</span>
              <span className="font-mono text-sm font-medium tabular-nums text-muted">
                08:10
              </span>
            </p>
            <div className="inline-block rounded-2xl rounded-bl-md bg-surface px-3.5 py-2.5 text-[15px] font-medium leading-relaxed text-foreground ring-1 ring-border">
              네, 연락처는{" "}
              <span
                className={cn(
                  "mx-0.5 inline-block px-0.5 font-mono font-bold transition-all duration-500 motion-reduce:animate-none motion-reduce:transition-none",
                  masked
                    ? "animate-[mask-chip-in_220ms_ease-out] text-foreground underline decoration-dotted underline-offset-2"
                    : scanning
                      ? "text-foreground underline decoration-dotted underline-offset-2"
                      : "text-foreground",
                )}
              >
                {masked ? "010*******" : "010-2847-3916"}
              </span>{" "}
              입니다.
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-base font-medium text-muted">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors motion-reduce:transition-none",
            done || masked ? "bg-primary" : "bg-border-strong",
          )}
        />
        {done || masked
          ? "마스킹 완료, 권한이 있는 사람만 원문 확인"
          : scanning
            ? "회의 내용 스캔 중"
            : "대화 기록 중"}
      </div>
    </div>
  );
}

/** STEP 02 — ~9초: 타임라인 4구간 + 완료 */
export function MockAutoSummary() {
  const ref = useRef<HTMLDivElement>(null);
  const segments = [
    {
      time: "00:00",
      kind: "안건",
      title: "시작·안건",
      body: "오늘 다룰 핵심 안건을 공유했습니다.",
    },
    {
      time: "05:00",
      kind: "논의",
      title: "본 논의",
      body: "핵심 이슈와 대안을 비교했습니다.",
    },
    {
      time: "25:00",
      kind: "결정",
      title: "결정",
      body: "우선순위와 진행 방향을 합의했습니다.",
    },
    {
      time: "35:00",
      kind: "후속",
      title: "후속 조치",
      body: "담당자와 마감일을 정리했습니다.",
    },
  ];
  // 0..3 구간, 4 완료 배지
  const phase = useShowcasePlayOnce(5, 2400, ref);

  return (
    <div ref={ref} className={MOCK_CARD} data-showcase="summary">
      <div className="flex items-center justify-between">
        <p className="text-base font-semibold text-muted">타임라인</p>
        <span className="text-base font-medium tabular-nums text-muted">45분</span>
      </div>
      <ul className="relative mt-5 space-y-3.5 before:absolute before:bottom-2 before:left-[0.85rem] before:top-2 before:w-px before:bg-border">
        {segments.map((seg, i) => (
          <li
            key={seg.time}
            className={cn(
              "relative flex gap-3 pl-1 transition-all duration-700 motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none",
              i <= phase
                ? "translate-y-0 opacity-100"
                : "translate-y-1 opacity-0",
            )}
          >
            <span className="relative z-10 mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-card ring-2 ring-border-strong">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <div className="min-w-0 flex-1 rounded-xl bg-surface px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold tabular-nums text-muted">
                  {seg.time}
                </span>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-sm font-semibold text-foreground">
                  {seg.kind}
                </span>
                <span className="text-base font-semibold text-foreground">
                  {seg.title}
                </span>
              </div>
              <p className="mt-1 break-keep text-base leading-relaxed text-muted">
                {seg.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <span
        className={cn(
          "mt-3 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-base font-semibold text-primary transition-opacity duration-700 motion-reduce:opacity-100 motion-reduce:transition-none",
          phase >= segments.length ? "opacity-100" : "opacity-0",
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
        결정·후속 정리 완료
      </span>
    </div>
  );
}

/** STEP 03 — ~7초: 단어 하이라이트 → 메모 */
export function MockReplayHighlight() {
  const ref = useRef<HTMLDivElement>(null);
  const words = ["오늘", "발표", "자료의", "발음을", "다시", "확인해주세요."];
  const PLAY_PHASES = words.length;
  const MEMO_PHASE = PLAY_PHASES;
  // 0..5 단어, 6 메모 아이콘
  const phase = useShowcasePlayOnce(MEMO_PHASE + 1, 1300, ref);

  const showMemo = phase >= MEMO_PHASE;
  const activeWordIdx =
    phase >= 0 && phase < PLAY_PHASES ? phase : -1;

  return (
    <div ref={ref} className={MOCK_CARD} data-showcase="replay">
      <div className="flex items-center gap-2 text-base font-semibold text-muted">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
        </span>
        다시 듣기
      </div>
      <div className="mt-5 flex gap-2.5">
        <SpeakerAvatar label="이" tone="primary" />
        <div className="min-w-0 flex-1">
          <p className="mb-1.5 flex items-baseline gap-1.5 text-base font-semibold text-primary">
            <span>이서준</span>
            <span className="font-mono text-sm font-medium tabular-nums text-muted">
              12:40
            </span>
          </p>
          <div className="group/bubble relative inline-flex max-w-full items-end gap-1">
            <div className="rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-left text-[15px] font-medium leading-relaxed text-primary-foreground">
              {words.map((w, i) => (
                <span
                  key={`${w}-${i}`}
                  className={cn(
                    "rounded px-0.5 transition-colors duration-300 motion-reduce:transition-none",
                    i === activeWordIdx && "word-play-mark word-play-mark-on-primary",
                  )}
                >
                  {w}{" "}
                </span>
              ))}
            </div>
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted transition-all duration-500 motion-reduce:opacity-100 motion-reduce:scale-100 motion-reduce:transition-none",
                showMemo ? "scale-100 opacity-100" : "scale-90 opacity-0",
              )}
            >
              <StickyNote className="h-4 w-4" strokeWidth={2.25} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** STEP 05 — 회의록 보관과 권한, ~8초: 잠금 → 파일 3개 등장 */
export function MockSecureVault() {
  const ref = useRef<HTMLDivElement>(null);
  const rows = [
    { name: "캠페인 킥오프.wav", meta: "음성 · 980KB", access: "본인만" },
    { name: "주간 리뷰 요약.md", meta: "문서 · 18KB", access: "열람 가능" },
    { name: "예외 케이스.xlsx", meta: "표 · 54KB", access: "열람 가능" },
  ];
  // 0 잠금 활성, 1..3 파일, 4 홀드
  const phase = useShowcasePlayOnce(5, 2000, ref);
  const locked = phase >= 0;
  const visibleFiles = phase < 1 ? 0 : Math.min(phase, rows.length);

  return (
    <div ref={ref} className={MOCK_CARD} data-showcase="vault">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl transition-colors duration-700 motion-reduce:transition-none",
            locked
              ? "bg-foreground text-background"
              : "bg-surface-2 text-muted",
          )}
        >
          <Lock className="h-4 w-4" strokeWidth={2} />
        </span>
        <div>
          <p className="text-base font-semibold text-foreground">보관함</p>
          <p className="text-base text-muted">암호화 저장, 역할 기반 접근</p>
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        {rows.map((row, i) => (
          <div
            key={row.name}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl bg-surface px-3.5 py-3 transition-all duration-700 motion-reduce:opacity-100 motion-reduce:translate-y-0 motion-reduce:transition-none",
              i < visibleFiles
                ? "translate-y-0 opacity-100"
                : "translate-y-1 opacity-0",
            )}
          >
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-foreground">
                {row.name}
              </p>
              <p className="text-base text-muted">{row.meta}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 text-base font-medium text-muted">
              <CheckCircle2
                className="h-3.5 w-3.5 text-primary"
                strokeWidth={2.5}
              />
              {row.access}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
