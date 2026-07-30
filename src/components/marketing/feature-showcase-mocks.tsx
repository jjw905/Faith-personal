"use client";

import { CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * 기능 소개용 미니 데모 애니메이션 (PC 전용, xl+에서만 렌더).
 * - 화면에 보일 때만 재생, 한 사이클 끝나면 잠시 쉬고 반복.
 * - prefers-reduced-motion이면 마지막 상태로 고정 표시.
 */
function useShowcaseLoop(steps: number, cycleMs: number, ref: React.RefObject<HTMLElement | null>) {
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [step, setStep] = useState(reduced ? steps - 1 : 0);

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let timer: number | null = null;
    let cancelled = false;

    function run(i: number) {
      if (cancelled) return;
      setStep(i);
      const isLast = i >= steps - 1;
      const wait = isLast ? cycleMs : cycleMs / steps;
      timer = window.setTimeout(() => {
        run(isLast ? 0 : i + 1);
      }, wait);
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          if (timer === null) run(0);
        } else {
          if (timer !== null) window.clearTimeout(timer);
          timer = null;
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);

    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      io.disconnect();
    };
  }, [reduced, steps, cycleMs, ref]);

  return step;
}

const MOCK_CARD =
  "h-full w-full rounded-3xl bg-card p-5 shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border";

/** STEP 01 — 실시간 음성 텍스트 추출 */
export function MockLiveTranscribe() {
  const ref = useRef<HTMLDivElement>(null);
  const step = useShowcaseLoop(3, 4200, ref);

  const lines = [
    { speaker: "화자 1", text: "다음 안건은 예산 승인 건입니다." },
    { speaker: "화자 2", text: "네, 초안은 어제 공유드렸습니다." },
    { speaker: "화자 1", text: "그럼 이번 주까지 검토 부탁드릴게요." },
  ];

  return (
    <div ref={ref} className={MOCK_CARD}>
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-masked opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-masked" />
        </span>
        <span className="text-xs font-semibold text-muted">회의 기록 중</span>
        <span className="record-beat-bars ml-auto text-muted-2">
          <span />
          <span />
          <span />
          <span />
          <span />
        </span>
      </div>
      <div className="mt-4 space-y-2.5">
        {lines.map((line, i) => (
          <div
            key={line.text}
            className={cn(
              "rounded-xl bg-surface px-3 py-2 text-[13px] leading-relaxed text-foreground transition-opacity duration-500",
              i <= step ? "opacity-100" : "opacity-0",
            )}
          >
            <span className="mr-1.5 text-[11px] font-semibold text-primary">
              {line.speaker}
            </span>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/** STEP 02 — 개인정보 자동 마스킹 */
export function MockAutoMask() {
  const ref = useRef<HTMLDivElement>(null);
  const step = useShowcaseLoop(3, 4200, ref);
  const masked = step >= 2;
  const scanning = step === 1;

  return (
    <div ref={ref} className={MOCK_CARD}>
      <div className="flex items-center gap-2 text-xs font-semibold text-muted">
        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
        개인정보 자동 감지
      </div>
      <div className="mt-4 rounded-xl bg-surface px-3 py-2.5 text-[13px] leading-relaxed text-foreground">
        <span className="mr-1.5 text-[11px] font-semibold text-primary">화자 2</span>
        네, 연락처는{" "}
        <span
          className={cn(
            "relative mx-0.5 inline-block rounded px-1 font-medium",
            masked
              ? "bg-surface-2 text-transparent"
              : scanning
                ? "bg-primary/15 text-foreground"
                : "text-foreground",
          )}
        >
          010-2847-3916
        </span>{" "}
        입니다.
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium text-muted-2">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors",
            masked ? "bg-primary" : "bg-border-strong",
          )}
        />
        {masked ? "마스킹 완료, 열람 권한이 있는 사람만 원문 확인" : "회의 내용 스캔 중"}
      </div>
    </div>
  );
}

/** STEP 03 — 회의 내용 자동 요약 */
export function MockAutoSummary() {
  const ref = useRef<HTMLDivElement>(null);
  const bullets = ["Q2 온보딩 일정 최종 확정", "A사 킥오프 담당자 배정 완료", "예산안 검토, 이번 주 내 회신"];
  const step = useShowcaseLoop(bullets.length + 1, 5000, ref);

  return (
    <div ref={ref} className={MOCK_CARD}>
      <p className="text-xs font-semibold text-muted">요약</p>
      <ul className="mt-3 space-y-2">
        {bullets.map((b, i) => (
          <li
            key={b}
            className={cn(
              "flex items-start gap-2 text-[13px] leading-relaxed text-foreground transition-all duration-500",
              i <= step ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
            )}
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-border-strong" />
            {b}
          </li>
        ))}
      </ul>
      <span
        className={cn(
          "mt-3 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition-opacity duration-500",
          step >= bullets.length ? "opacity-100" : "opacity-0",
        )}
      >
        <CheckCircle2 className="h-3 w-3" strokeWidth={2.25} />
        결정 사항 3건 정리 완료
      </span>
    </div>
  );
}

/** STEP 04 — 안전한 회의록 관리 */
export function MockSecureVault() {
  const ref = useRef<HTMLDivElement>(null);
  const rows = [
    { name: "팀 대표", access: "전체 열람" },
    { name: "팀장", access: "회의별 열람" },
  ];
  const step = useShowcaseLoop(rows.length + 1, 4600, ref);

  return (
    <div ref={ref} className={MOCK_CARD}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-xl transition-colors duration-500",
            step >= 0 ? "bg-foreground text-background" : "bg-surface-2 text-muted",
          )}
        >
          <Lock className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="text-xs font-semibold text-muted">암호화 저장, 역할 기반 접근</span>
      </div>
      <div className="mt-4 space-y-2">
        {rows.map((row, i) => (
          <div
            key={row.name}
            className={cn(
              "flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-[13px] transition-opacity duration-500",
              i < step ? "opacity-100" : "opacity-0",
            )}
          >
            <span className="font-medium text-foreground">{row.name}</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted">
              <CheckCircle2 className="h-3 w-3 text-primary" strokeWidth={2.5} />
              {row.access}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
