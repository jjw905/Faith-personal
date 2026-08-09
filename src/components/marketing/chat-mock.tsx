"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

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

/** 히어로 목업 — 화자 구분 받아쓰기, 결정·후속 조치가 남는 회의 흐름. */
const SCRIPT: ScriptLine[] = [
  {
    side: "left",
    name: "박지우",
    initial: "박",
    delay: 0,
    content: "신규 프로젝트 킥오프를 시작하겠습니다. 일정부터 맞춰보죠.",
  },
  {
    side: "right",
    name: "김서연",
    initial: "김",
    delay: 2200,
    content: "킥오프는 이번 주 목요일로 확정했습니다.",
  },
  {
    side: "left",
    name: "이도현",
    initial: "이",
    delay: 2000,
    content: "자료는 공유 폴더에 정리했습니다. 발표 순서를 확인해 주세요.",
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
    content: "좋습니다. 데모 환경은 준비됐나요?",
  },
  {
    side: "right",
    name: "김서연",
    initial: "김",
    delay: 2300,
    content: "데모 환경은 준비됐고, 주요 흐름까지 확인했습니다.",
  },
  {
    side: "left",
    name: "이도현",
    initial: "이",
    delay: 2000,
    content: "회의실과 장비 준비도 확인했습니다.",
  },
  {
    side: "right",
    name: "최민준",
    initial: "최",
    delay: 2100,
    content: "감사합니다. 실시간 받아쓰기 데모도 같이 보여드릴게요.",
  },
  {
    side: "left",
    name: "박지우",
    initial: "박",
    delay: 2000,
    content: "다음으로 계약 일정과 후속 작업을 확인하겠습니다.",
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
    concurrent: true,
    content: "회신은 목요일까지로 잡으면 일정에 맞습니다.",
  },
  {
    side: "right",
    name: "최민준",
    initial: "최",
    delay: 2100,
    content: "결정 사항은 Faith 회의록에 바로 남겨둘게요.",
  },
  {
    side: "left",
    name: "박지우",
    initial: "박",
    delay: 2000,
    content: "후속 조치는 서연 님이 초안, 민준 님이 데모 점검으로 정리하죠.",
  },
  {
    side: "right",
    name: "김서연",
    initial: "김",
    delay: 2100,
    concurrent: true,
    content: "네, 요약이랑 타임라인도 회의 끝나면 바로 확인해 볼게요.",
  },
  {
    side: "left",
    name: "이도현",
    initial: "이",
    delay: 2000,
    content: "좋습니다. 다음 안건은 월요일에 이어서 보죠.",
  },
  {
    side: "right",
    name: "최민준",
    initial: "최",
    delay: 1900,
    content: "알겠습니다. 오늘 회의는 여기까지로 하겠습니다.",
  },
];

type VisibleMessage = ScriptLine & { key: number; pending: boolean };

function TypingDots() {
  return (
    <span className="running-dots chat-running-dots flex h-[1lh] w-5 items-center justify-center gap-1 text-current opacity-50">
      <span />
      <span />
      <span />
    </span>
  );
}

const BUBBLE_BASE =
  "rounded-2xl px-3.5 py-2.5 text-left text-[14px] leading-relaxed xl:text-[15px]";

function MockBubble({
  side,
  name,
  initial,
  pending,
  content,
}: {
  side: Side;
  name: string;
  initial: string;
  pending: boolean;
  content: ReactNode;
}) {
  const isMe = side === "left";
  const displayName = isMe ? "나" : name;
  const displayInitial = isMe ? "나" : initial;

  return (
    <div
      className={cn(
        "flex w-full items-end gap-2.5",
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
          "flex min-w-0 max-w-[min(78%,clamp(12rem,55vw,28rem))] flex-col",
          isMe ? "items-start" : "items-end",
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
        <div className="inline-grid max-w-full grid-cols-1">
          <div
            aria-hidden
            className={cn(
              BUBBLE_BASE,
              "invisible col-start-1 row-start-1 min-w-0",
            )}
          >
            {content}
          </div>
          <div
            className={cn(
              BUBBLE_BASE,
              "col-start-1 row-start-1 max-w-full self-start",
              isMe ? "justify-self-start" : "justify-self-end",
              isMe
                ? "rounded-bl-md bg-primary text-primary-foreground"
                : "rounded-br-md bg-surface text-foreground",
            )}
          >
            {pending ? <TypingDots /> : content}
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatDateDivider({ label }: { label: string }) {
  if (!label) return null;
  return (
    <div className="flex shrink-0 justify-center pb-1">
      <span className="rounded-full bg-surface-2 px-3 py-1 text-[13px] font-semibold tabular-nums tracking-tight text-foreground">
        {label}
      </span>
    </div>
  );
}

/** 히어로 우측 — 양방향 회의 채팅 목업.
 *
 * 시나리오:
 * - 마운트당 1회만 재생(루프/초기화 없음)
 * - 메시지는 위에서부터 쌓임, 넘치면 새 줄 추가 시에만 scrollTop 보정
 * - ...→내용은 말풍선 안에서만 바뀜(높이 예약됨, 스크롤 없음)
 * - 채팅 영역 스크롤/휠 가로채기 없음(페이지 스크롤 버벅임 방지)
 * - 화면 밖에서는 DOM 갱신 보류, 다시 보이면 일괄 반영
 * - 페이지를 나갔다 다시 오면(재마운트)만 처음부터 재생
 */
export function ChatMock() {
  const timersRef = useRef<number[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const messagesRef = useRef<VisibleMessage[]>([]);
  const inViewRef = useRef(true);
  const rafRef = useRef(0);
  const [visible, setVisible] = useState<VisibleMessage[]>([]);

  function clearTimers() {
    timersRef.current.forEach((t) => window.clearTimeout(t));
    timersRef.current = [];
  }

  function flushVisible(sync = false) {
    if (!inViewRef.current) return;
    if (sync) {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      setVisible([...messagesRef.current]);
      return;
    }
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = 0;
      if (!inViewRef.current) return;
      setVisible(messagesRef.current);
    });
  }

  /** 새 메시지 줄이 추가될 때만 스크롤. ...→내용은 높이 동일 → 건드리지 않음 */
  function scrollToTailIfNeeded() {
    const feed = feedRef.current;
    const list = listRef.current;
    if (!feed || !list) return;
    const max = list.scrollHeight - feed.clientHeight;
    feed.scrollTop = max > 0 ? max : 0;
  }

  const dateLabel = useSyncExternalStore(
    () => () => {},
    () =>
      new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      }).format(new Date()),
    () => "",
  );

  // 화면 밖이면 setState 생략 — 스크롤 중 메인 스레드 부담 감소
  useEffect(() => {
    const el = feedRef.current?.closest("[data-chat-mock]") ?? feedRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      ([entry]) => {
        const nowIn = Boolean(entry?.isIntersecting);
        inViewRef.current = nowIn;
        if (nowIn) setVisible(messagesRef.current);
      },
      { rootMargin: "120px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useLayoutEffect(() => {
    const grew = visible.length > prevCountRef.current;
    prevCountRef.current = visible.length;
    if (grew) scrollToTailIfNeeded();
  }, [visible]);

  useEffect(() => {
    let cancelled = false;

    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduceMotion) {
      const initial = SCRIPT.slice(0, 4).map((line, i) => ({
        ...line,
        key: i,
        pending: false,
      }));
      messagesRef.current = initial;
      // 이펙트 본문 동기 setState 금지 — 첫 틱으로 미룬다.
      const id = window.setTimeout(() => {
        if (!cancelled) setVisible(initial);
      }, 0);
      return () => {
        cancelled = true;
        window.clearTimeout(id);
      };
    }

    clearTimers();
    messagesRef.current = [];
    const clearId = window.setTimeout(() => {
      if (!cancelled) setVisible([]);
    }, 0);

    const GAP = 160;
    const TYPING = 1400;
    const READ = 900;
    const OVERLAP = 380;

    let cursor = 600;
    let lastStart = 0;

    SCRIPT.forEach((line, i) => {
      const key = i;
      const start =
        line.concurrent && i > 0 ? lastStart + OVERLAP : cursor + GAP;

      timersRef.current.push(
        window.setTimeout(() => {
          if (cancelled) return;
          const prev = messagesRef.current;
          if (prev.some((m) => m.key === key)) return;
          messagesRef.current = [...prev, { ...line, key, pending: true }];
          flushVisible(true);
        }, start),
      );

      timersRef.current.push(
        window.setTimeout(() => {
          if (cancelled) return;
          const prev = messagesRef.current;
          const idx = prev.findIndex((m) => m.key === key);
          if (idx < 0 || !prev[idx]!.pending) return;
          const copy = prev.slice();
          copy[idx] = { ...copy[idx]!, pending: false };
          messagesRef.current = copy;
          flushVisible(true);
        }, start + TYPING),
      );

      lastStart = start;
      cursor = Math.max(cursor, start + TYPING + READ);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(clearId);
      clearTimers();
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, []);

  return (
    <div
      data-chat-mock
      className="w-full rounded-3xl bg-card p-5 shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border xl:p-6"
      style={{ contain: "layout paint" }}
    >
      <div className="flex h-[400px] flex-col xl:h-[440px]">
        <div
          ref={feedRef}
          data-chat-feed
          className="min-h-0 flex-1 overflow-hidden"
        >
          <div ref={listRef} className="flex flex-col gap-4 px-2 pb-1 pt-6 max-md:gap-5 xl:gap-3.5">
            <ChatDateDivider label={dateLabel} />
            {visible.map((msg) => (
              <MockBubble
                key={msg.key}
                side={msg.side}
                name={msg.name}
                initial={msg.initial}
                pending={msg.pending}
                content={msg.content}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
