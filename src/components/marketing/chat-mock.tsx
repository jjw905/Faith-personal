"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/** 마우스 포인터 아이콘. */
function CursorIcon() {
  return (
    <svg
      width="30"
      height="30"
      viewBox="0 0 24 24"
      fill="none"
      style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.35))" }}
    >
      <path
        d="M5 3l14 8-6 1.5L10 20 5 3z"
        fill="#1d1d1f"
        stroke="#ffffff"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 커서 접근 → 탭 순간에 마스킹 해제 → 커서 퇴장. */
const MASK_WAIT_MS = 700;
const MASK_TAP_MS = 920;
/** cursor-tap 키프레임 탭 지점(≈58%)에 맞춤 */
const MASK_PRESS_RATIO = 0.58;

/** 마스킹 — blur 대신 단색 칩(합성 비용↓). */
function Masked({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  const [cursorOn, setCursorOn] = useState(false);
  const [rippleOn, setRippleOn] = useState(false);

  useEffect(() => {
    const pressAt = Math.round(MASK_TAP_MS * MASK_PRESS_RATIO);
    const toCursor = window.setTimeout(() => setCursorOn(true), MASK_WAIT_MS);
    const toPress = window.setTimeout(() => {
      setRippleOn(true);
      setRevealed(true);
    }, MASK_WAIT_MS + pressAt);
    const toCursorOff = window.setTimeout(
      () => {
        setCursorOn(false);
        setRippleOn(false);
      },
      MASK_WAIT_MS + MASK_TAP_MS,
    );
    return () => {
      window.clearTimeout(toCursor);
      window.clearTimeout(toPress);
      window.clearTimeout(toCursorOff);
    };
  }, []);

  return (
    <span className="relative mx-0.5 inline-block align-baseline">
      <span
        className={cn(
          "inline rounded px-1 font-medium transition-colors duration-150",
          revealed
            ? "bg-transparent text-inherit"
            : "select-none bg-surface-2 text-transparent",
        )}
        aria-hidden={!revealed}
      >
        {children}
      </span>
      {rippleOn && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-[tap-ripple_480ms_ease-out] rounded-full bg-foreground/18"
        />
      )}
      {cursorOn && (
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-3 left-1/2 z-30 animate-[cursor-tap_920ms_ease-out]"
        >
          <CursorIcon />
        </span>
      )}
    </span>
  );
}

type Side = "left" | "right";

const TEAM: Record<string, string> = {
  김서연: "디자인팀",
  최민준: "개발팀",
  이도현: "기획팀",
  박지우: "기획팀",
};

type ScriptLine = {
  side: Side;
  name: string;
  initial: string;
  content: ReactNode;
  delay: number;
  concurrent?: boolean;
};

const SCRIPT: ScriptLine[] = [
  {
    side: "left",
    name: "박지우",
    initial: "박",
    delay: 0,
    content: "오늘 Q2 온보딩 점검 시작할게요. 일정부터 맞춰볼까요?",
  },
  {
    side: "right",
    name: "김서연",
    initial: "김",
    delay: 2200,
    content: "네, A사 킥오프는 이번 주 목요일로 잡았습니다.",
  },
  {
    side: "left",
    name: "이도현",
    initial: "이",
    delay: 2000,
    content: "자료는 공유 폴더에 올려뒀어요. 발표 순서만 확인 부탁드려요.",
  },
  {
    side: "right",
    name: "최민준",
    initial: "최",
    delay: 2100,
    concurrent: true,
    content: "발표는 제가 먼저 하고, 이어서 서연 님이 데모 진행하면 될 것 같아요.",
  },
  {
    side: "left",
    name: "박지우",
    initial: "박",
    delay: 2000,
    content: "좋아요. 혹시 A사 담당자 연락처 있으신가요?",
  },
  {
    side: "right",
    name: "김서연",
    initial: "김",
    delay: 2300,
    content: (
      <>
        네, 담당자 번호는 <Masked>010-2847-3916</Masked> 입니다.
      </>
    ),
  },
  {
    side: "left",
    name: "이도현",
    initial: "이",
    delay: 2000,
    content: "미팅룸은 301호로 예약해 둘게요. 노트북 어댑터도 챙기겠습니다.",
  },
  {
    side: "right",
    name: "최민준",
    initial: "최",
    delay: 2100,
    content: "감사합니다. 데모 계정은 어제 준비 끝났어요.",
  },
  {
    side: "left",
    name: "박지우",
    initial: "박",
    delay: 2000,
    content: "결제 건도 확인할게요. 승인 내역 공유 가능할까요?",
  },
  {
    side: "right",
    name: "최민준",
    initial: "최",
    delay: 2300,
    content: (
      <>
        카드번호 <Masked>1681-4920-3371-5445</Masked> 로 결제 완료됐습니다.
      </>
    ),
  },
  {
    side: "left",
    name: "김서연",
    initial: "김",
    delay: 2000,
    content: "영수증은 고객사에도 같이 보내드릴까요?",
  },
  {
    side: "right",
    name: "이도현",
    initial: "이",
    delay: 1900,
    concurrent: true,
    content: "네, PDF로 보내주시면 됩니다.",
  },
  {
    side: "left",
    name: "박지우",
    initial: "박",
    delay: 2000,
    content: "다음으로 B사 계약 일정 볼까요. 초안은 검토 끝나셨나요?",
  },
  {
    side: "right",
    name: "김서연",
    initial: "김",
    delay: 2100,
    content: "법무 코멘트 반영했고, 내일 오전까지 최종본 올릴게요.",
  },
  {
    side: "left",
    name: "이도현",
    initial: "이",
    delay: 2000,
    content: "계약서 회신 메일 주소만 알려주세요.",
  },
  {
    side: "right",
    name: "최민준",
    initial: "최",
    delay: 2300,
    content: (
      <>
        <Masked>legal.b@company.kr</Masked> 로 보내주시면 됩니다.
      </>
    ),
  },
  {
    side: "left",
    name: "박지우",
    initial: "박",
    delay: 2000,
    content: "출장 건은 항공편 예약만 남았죠?",
  },
  {
    side: "right",
    name: "김서연",
    initial: "김",
    delay: 2100,
    concurrent: true,
    content: "네, 화요일 오전 출발로 잡혀 있어요. 숙소도 확정됐습니다.",
  },
  {
    side: "left",
    name: "이도현",
    initial: "이",
    delay: 2000,
    content: "여권 정보만 한 번 더 확인해 주세요.",
  },
  {
    side: "right",
    name: "최민준",
    initial: "최",
    delay: 2300,
    content: (
      <>
        여권번호는 <Masked>M123A4567</Masked> 입니다.
      </>
    ),
  },
  {
    side: "left",
    name: "박지우",
    initial: "박",
    delay: 2100,
    content: "좋습니다. 민감정보는 Faith가 자동으로 가리니 회의록은 그대로 공유해도 됩니다.",
  },
  {
    side: "right",
    name: "김서연",
    initial: "김",
    delay: 2200,
    content: "네, 다음 안건은 월요일에 이어서 보죠.",
  },
  {
    side: "left",
    name: "이도현",
    initial: "이",
    delay: 1900,
    content: "알겠습니다. 오늘 회의는 여기까지로 하겠습니다.",
  },
];

type VisibleMessage = ScriptLine & { key: number; pending: boolean };

function TypingDots() {
  return (
    <span className="running-dots inline-flex items-center gap-1 py-1.5 text-muted-2">
      <span />
      <span />
      <span />
    </span>
  );
}

function MockBubble({
  side,
  name,
  initial,
  children,
}: {
  side: Side;
  name: string;
  initial: string;
  children: ReactNode;
}) {
  const isMe = side === "left";
  const displayName = isMe ? "나" : name;
  const displayInitial = isMe ? "나" : initial;

  return (
    <div
      className={cn(
        "flex w-full animate-[bubble-in_240ms_ease-out] items-end gap-2.5",
        isMe ? "flex-row" : "flex-row-reverse",
      )}
      style={{ contain: "layout paint" }}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          isMe
            ? "bg-primary text-primary-foreground ring-2 ring-primary/20"
            : "bg-surface-2 text-foreground",
        )}
      >
        {displayInitial}
      </div>
      <div
        className={cn(
          "max-w-[78%] min-w-0",
          isMe ? "items-start text-left" : "items-end text-right",
        )}
      >
        <p
          className={cn(
            "mb-1 flex items-baseline gap-1.5 text-[11px] font-semibold",
            isMe ? "pl-0.5 text-primary" : "flex-row-reverse pr-0.5",
          )}
        >
          <span className={isMe ? "text-primary" : "text-foreground"}>
            {displayName}
          </span>
          {!isMe && TEAM[name] && (
            <span className="rounded bg-surface-2 px-1.5 py-px text-[10px] font-medium text-muted">
              {TEAM[name]}
            </span>
          )}
        </p>
        <div
          className={cn(
            "inline-block rounded-2xl px-3.5 py-2.5 text-left text-[14px] leading-relaxed xl:text-[15px]",
            isMe
              ? "rounded-bl-md bg-primary text-primary-foreground"
              : "rounded-br-md bg-surface text-foreground",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function ChatDateDivider({ label }: { label: string }) {
  if (!label) return null;
  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <span className="rounded-full bg-surface-2 px-3 py-1 text-[13px] font-semibold tabular-nums tracking-tight text-foreground">
        {label}
      </span>
      <span className="h-24 w-px bg-border-strong xl:h-28" aria-hidden />
    </div>
  );
}

/** 히어로 우측 — 양방향 회의 채팅 목업. 뷰포트에 보일 때만 재생. */
export function ChatMock() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [visible, setVisible] = useState<VisibleMessage[]>([]);
  const [cycle, setCycle] = useState(0);
  const [dateLabel, setDateLabel] = useState("");
  const [spawned, setSpawned] = useState(0);

  useEffect(() => {
    setDateLabel(
      new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(new Date()),
    );
  }, []);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(Boolean(entry?.isIntersecting));
      },
      { rootMargin: "80px 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      setVisible(
        SCRIPT.slice(0, 4).map((line, i) => ({
          ...line,
          key: i,
          pending: false,
        })),
      );
      setSpawned(4);
      return;
    }

    const GAP = 160;
    const TYPING = 1400;
    const READ = 900;
    const OVERLAP = 380;
    const timers: number[] = [];

    let cursor = 600;
    let lastStart = 0;
    setSpawned(0);
    setVisible([]);

    SCRIPT.forEach((line, i) => {
      const key = cycle * 1000 + i;
      const start =
        line.concurrent && i > 0 ? lastStart + OVERLAP : cursor + GAP;

      timers.push(
        window.setTimeout(() => {
          setSpawned((n) => n + 1);
          setVisible((prev) => {
            // 화면에 안 보이는 오래된 버블은 잘라 렌더 비용 제한
            const next = [...prev, { ...line, key, pending: true }];
            return next.length > 8 ? next.slice(-8) : next;
          });
        }, start),
      );

      timers.push(
        window.setTimeout(() => {
          setVisible((prev) => {
            const idx = prev.findIndex((m) => m.key === key);
            if (idx < 0) return prev;
            if (!prev[idx]!.pending) return prev;
            const copy = prev.slice();
            copy[idx] = { ...copy[idx]!, pending: false };
            return copy;
          });
        }, start + TYPING),
      );

      lastStart = start;
      cursor = Math.max(cursor, start + TYPING + READ);
    });

    timers.push(
      window.setTimeout(() => {
        setVisible([]);
        setCycle((c) => c + 1);
      }, cursor + 700),
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [cycle, inView]);

  // 화면 밖으로 나가면 타이머만 멈추고, 다시 들어오면 cycle로 재시작
  useEffect(() => {
    if (!inView) {
      setVisible([]);
      setSpawned(0);
    }
  }, [inView]);

  const showDate = spawned < 5;

  return (
    <div
      ref={rootRef}
      className="w-full rounded-3xl border border-transparent bg-card p-5 xl:p-6"
      style={{
        boxShadow:
          "0 4px 12px rgba(17, 24, 39, 0.06), 0 24px 56px rgba(17, 24, 39, 0.14)",
        contentVisibility: "auto",
        containIntrinsicSize: "0 440px",
      }}
    >
      <div className="relative h-[400px] xl:h-[440px]">
        <div className="absolute inset-0 flex flex-col justify-end gap-3.5 overflow-hidden pb-1">
          {showDate && <ChatDateDivider label={dateLabel} />}
          {visible.map((msg) => (
            <MockBubble
              key={msg.key}
              side={msg.side}
              name={msg.name}
              initial={msg.initial}
            >
              {msg.pending ? <TypingDots /> : msg.content}
            </MockBubble>
          ))}
        </div>
      </div>
    </div>
  );
}
