"use client";

import { useEffect, useState, type ReactNode } from "react";

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

type MaskPhase = "masked" | "clicking" | "revealed";

/** 마스킹된 민감정보 — 재생되듯 자동으로 커서가 클릭해 원문이 드러남. */
function Masked({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<MaskPhase>("masked");

  useEffect(() => {
    const toClick = window.setTimeout(() => setPhase("clicking"), 1000);
    const toReveal = window.setTimeout(() => setPhase("revealed"), 1750);
    return () => {
      window.clearTimeout(toClick);
      window.clearTimeout(toReveal);
    };
  }, []);

  const revealed = phase === "revealed";

  return (
    <span className="relative mx-0.5 inline-block align-baseline">
      <span
        className={cn(
          "inline rounded px-1 font-medium text-foreground transition-all duration-300",
          revealed ? "bg-transparent" : "select-none bg-surface-2 blur-[4.5px]",
        )}
      >
        {children}
      </span>
      {phase === "clicking" && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-8 w-8 -translate-x-1/2 -translate-y-1/2 animate-[tap-ripple_750ms_ease-out] rounded-full bg-foreground/20"
        />
      )}
      {phase === "clicking" && (
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-3 left-1/2 z-30 animate-[cursor-tap_750ms_ease-out]"
        >
          <CursorIcon />
        </span>
      )}
    </span>
  );
}

type Side = "left" | "right";

/** 상대 화자별 소속 팀 별칭. */
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
  /** 이전 메시지 이후 대기(ms) */
  delay: number;
  /** 직전 발화와 동시에(겹쳐) 말하는 경우 */
  concurrent?: boolean;
};

/** 약 1분 분량 회의 대화 — 일반 대화와 마스킹이 자연스럽게 섞임. */
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
    delay: 2600,
    content: "네, A사 킥오프는 이번 주 목요일로 잡았습니다.",
  },
  {
    side: "left",
    name: "이도현",
    initial: "이",
    delay: 2400,
    content: "자료는 공유 폴더에 올려뒀어요. 발표 순서만 확인 부탁드려요.",
  },
  {
    side: "right",
    name: "최민준",
    initial: "최",
    delay: 2500,
    concurrent: true,
    content: "발표는 제가 먼저 하고, 이어서 서연 님이 데모 진행하면 될 것 같아요.",
  },
  {
    side: "left",
    name: "박지우",
    initial: "박",
    delay: 2400,
    content: "좋아요. 혹시 A사 담당자 연락처 있으신가요?",
  },
  {
    side: "right",
    name: "김서연",
    initial: "김",
    delay: 2700,
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
    delay: 2400,
    content: "미팅룸은 301호로 예약해 둘게요. 노트북 어댑터도 챙기겠습니다.",
  },
  {
    side: "right",
    name: "최민준",
    initial: "최",
    delay: 2500,
    content: "감사합니다. 데모 계정은 어제 준비 끝났어요.",
  },
  {
    side: "left",
    name: "박지우",
    initial: "박",
    delay: 2400,
    content: "결제 건도 확인할게요. 승인 내역 공유 가능할까요?",
  },
  {
    side: "right",
    name: "최민준",
    initial: "최",
    delay: 2700,
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
    delay: 2400,
    content: "영수증은 고객사에도 같이 보내드릴까요?",
  },
  {
    side: "right",
    name: "이도현",
    initial: "이",
    delay: 2300,
    concurrent: true,
    content: "네, PDF로 보내주시면 됩니다.",
  },
  {
    side: "left",
    name: "박지우",
    initial: "박",
    delay: 2400,
    content: "다음으로 B사 계약 일정 볼까요. 초안은 검토 끝나셨나요?",
  },
  {
    side: "right",
    name: "김서연",
    initial: "김",
    delay: 2500,
    content: "법무 코멘트 반영했고, 내일 오전까지 최종본 올릴게요.",
  },
  {
    side: "left",
    name: "이도현",
    initial: "이",
    delay: 2400,
    content: "계약서 회신 메일 주소만 알려주세요.",
  },
  {
    side: "right",
    name: "최민준",
    initial: "최",
    delay: 2700,
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
    delay: 2400,
    content: "출장 건은 항공편 예약만 남았죠?",
  },
  {
    side: "right",
    name: "김서연",
    initial: "김",
    delay: 2500,
    concurrent: true,
    content: "네, 화요일 오전 출발로 잡혀 있어요. 숙소도 확정됐습니다.",
  },
  {
    side: "left",
    name: "이도현",
    initial: "이",
    delay: 2400,
    content: "여권 정보만 한 번 더 확인해 주세요.",
  },
  {
    side: "right",
    name: "최민준",
    initial: "최",
    delay: 2700,
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
    delay: 2500,
    content: "좋습니다. 민감정보는 Faith가 자동으로 가리니 회의록은 그대로 공유해도 됩니다.",
  },
  {
    side: "right",
    name: "김서연",
    initial: "김",
    delay: 2600,
    content: "네, 다음 안건은 월요일에 이어서 보죠.",
  },
  {
    side: "left",
    name: "이도현",
    initial: "이",
    delay: 2300,
    content: "알겠습니다. 오늘 회의는 여기까지로 하겠습니다.",
  },
];

type VisibleMessage = ScriptLine & { key: number; pending: boolean };

/** 음성 입력중을 나타내는 점 3개. */
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
  // 왼쪽 = 나(사용자 본인)
  const isMe = side === "left";
  const displayName = isMe ? "나" : name;
  const displayInitial = isMe ? "나" : initial;

  return (
    <div
      className={cn(
        "flex w-full animate-[bubble-in_320ms_ease-out] items-end gap-2.5",
        isMe ? "flex-row" : "flex-row-reverse",
      )}
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
            "inline-block rounded-2xl px-3.5 py-2.5 text-left text-[14px] leading-relaxed sm:text-[15px]",
            isMe
              ? "rounded-bl-md bg-primary text-primary-foreground shadow-soft"
              : "rounded-br-md bg-card text-foreground ring-1 ring-border",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/** 히어로 우측 — 양방향 회의 채팅 목업 (약 1분 루프). */
export function ChatMock() {
  const [visible, setVisible] = useState<VisibleMessage[]>([]);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const GAP = 200; // 이전 발화 종료 후 텀
    const TYPING = 2000; // 점(...) 유지 시간
    const READ = 1300; // 텍스트 변환 후 읽는 텀
    const OVERLAP = 500; // 동시 발화 시 시작 간격
    const timers: number[] = [];

    let cursor = 400; // 다음 발화 시작 시점
    let lastStart = 0; // 직전 발화 시작 시점

    SCRIPT.forEach((line, i) => {
      const key = cycle * 1000 + i;
      const start =
        line.concurrent && i > 0 ? lastStart + OVERLAP : cursor + GAP;

      // 입력중(...) 말풍선 등장
      timers.push(
        window.setTimeout(() => {
          setVisible((prev) => {
            const next = [...prev, { ...line, key, pending: true }];
            return next.length > 6 ? next.slice(-6) : next;
          });
        }, start),
      );

      // 같은 말풍선을 실제 채팅으로 변환
      timers.push(
        window.setTimeout(() => {
          setVisible((prev) =>
            prev.map((m) => (m.key === key ? { ...m, pending: false } : m)),
          );
        }, start + TYPING),
      );

      lastStart = start;
      cursor = Math.max(cursor, start + TYPING + READ);
    });

    // 루프 재시작
    timers.push(
      window.setTimeout(() => {
        setVisible([]);
        setCycle((c) => c + 1);
      }, cursor + 900),
    );

    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [cycle]);

  return (
    <div className="w-full overflow-hidden rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-border sm:p-6">
      <div className="relative h-[420px] overflow-hidden sm:h-[440px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-surface to-transparent" />
        <div className="flex h-full flex-col justify-end gap-3.5 overflow-hidden pb-1 pt-2">
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
