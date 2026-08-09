"use client";

import {
  Archive,
  AudioLines,
  ChevronLeft,
  CircleHelp,
  ClipboardList,
  Menu,
  MessageSquare,
  Mic,
  Plus,
  Search,
  Upload,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useMemo } from "react";

import { MaskedText } from "@/components/meetings/masked-text";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { APP_NAME } from "@/lib/constants";
import { maskPii } from "@/lib/masking";
import { cn } from "@/lib/utils";

import {
  HELP_FIG_HOME,
  HELP_FIG_MASKING,
  HELP_FIG_TIMELINE,
} from "./fixtures";

export type HelpFigScene = "home" | "timeline" | "masking";
export type HelpFigVp = "desktop" | "mobile";

const FRAME: Record<HelpFigVp, { w: number; h: number }> = {
  desktop: { w: 1680, h: 980 },
  mobile: { w: 1134, h: 1920 },
};

function FigSidebar({ active = "home" }: { active?: "home" | "other" }) {
  const items = [
    { title: "회의", icon: Mic, nested: true },
    { title: "보관함", icon: Archive },
    { title: "도움말", icon: CircleHelp },
  ];
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-app-canvas px-3 py-4">
      <div className="mb-6 flex items-center justify-between px-2">
        <span className="text-xl font-semibold text-foreground">{APP_NAME}</span>
      </div>
      <nav className="flex flex-col gap-1" aria-label="주 메뉴">
        {items.map((item) => {
          const Icon = item.icon;
          const isMeetings = item.title === "회의";
          return (
            <div key={item.title}>
              <div
                className={cn(
                  "flex min-h-12 items-center gap-2 rounded-lg px-2 text-base font-semibold",
                  isMeetings && active === "home"
                    ? "text-foreground"
                    : "text-foreground",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" strokeWidth={2} />
                <span>{item.title}</span>
              </div>
              {item.nested ? (
                <div className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
                  <div className="flex min-h-12 items-center gap-2 rounded-lg px-2 text-sm text-muted">
                    <UsersRound className="h-4 w-4" />
                    팀
                  </div>
                  <div className="flex min-h-12 items-center gap-2 rounded-lg bg-surface-2 px-2 text-sm font-semibold text-foreground">
                    <UserRound className="h-4 w-4" />
                    개인
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

function MobileTopBar({ title }: { title?: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
      {title ? (
        <>
          <ChevronLeft className="h-5 w-5 text-foreground" />
          <span className="text-base font-semibold text-foreground">돌아가기</span>
          <span className="mx-auto text-lg font-semibold text-foreground">
            {title}
          </span>
        </>
      ) : (
        <>
          <Menu className="h-5 w-5 text-foreground" />
          <span className="text-xl font-semibold text-foreground">{APP_NAME}</span>
        </>
      )}
    </header>
  );
}

function HomeScene({ vp }: { vp: HelpFigVp }) {
  const isMobile = vp === "mobile";
  const body = (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-hidden px-4 py-5 sm:px-6">
      <div>
        <p className="text-base text-muted">{HELP_FIG_HOME.dateLabel}</p>
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          {HELP_FIG_HOME.title}
        </h1>
      </div>
      <div className="flex gap-3">
        <div className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-base font-semibold text-primary-foreground">
          <AudioLines className="h-5 w-5" />
          실시간 기록
        </div>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-card text-foreground shadow-soft ring-1 ring-border">
          <Upload className="h-5 w-5" />
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl bg-card p-4 shadow-soft ring-1 ring-border/60">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-xl font-semibold text-foreground">내 일정</h2>
          <Plus className="h-5 w-5 text-muted" />
        </div>
        <div className="mb-3 flex h-12 items-center gap-2 rounded-xl bg-surface-2 px-3 text-base text-muted">
          <Search className="h-4 w-4" />
          내 회의 검색
        </div>
        <ul className="space-y-2">
          {HELP_FIG_HOME.schedules.map((row, i) => (
            <li
              key={row.title}
              className={cn(
                "rounded-2xl px-3 py-3",
                i === 0
                  ? "border-l-4 border-primary bg-primary/5"
                  : "bg-surface",
              )}
            >
              <p className="text-base font-semibold text-foreground">
                {row.when}
              </p>
              <p className="text-lg font-semibold text-foreground">{row.title}</p>
              <p className="text-base text-muted">{row.place}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="min-h-0 flex-1 overflow-hidden rounded-3xl bg-card p-4 shadow-soft ring-1 ring-border/60">
        <h3 className="mb-3 text-xl font-semibold text-foreground">내 기록</h3>
        <ul className="space-y-3">
          {HELP_FIG_HOME.records.map((row) => (
            <li key={row.title + row.when} className="rounded-2xl bg-surface px-3 py-3">
              <div className="flex flex-wrap items-center gap-2 text-base text-muted">
                <span>{row.when}</span>
                <span>{row.ago}</span>
                <span className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-0.5 text-sm text-primary-foreground">
                  {row.capture === "업로드" ? (
                    <Upload className="h-3.5 w-3.5" />
                  ) : (
                    <AudioLines className="h-3.5 w-3.5" />
                  )}
                  {row.capture}
                </span>
              </div>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {row.title}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {row.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-surface-2 px-2.5 py-0.5 text-sm text-muted"
                  >
                    {t}
                  </span>
                ))}
                <span className="ml-auto text-base tabular-nums text-muted">
                  {row.duration}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex h-full flex-col bg-background">
        <MobileTopBar />
        {body}
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      <FigSidebar active="home" />
      <div className="min-w-0 flex-1 overflow-hidden">{body}</div>
    </div>
  );
}

function TimelineScene({ vp }: { vp: HelpFigVp }) {
  const isMobile = vp === "mobile";
  const panel = (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {!isMobile ? (
        <div className="flex items-center gap-4 border-b border-border px-6 pt-4">
          <button
            type="button"
            className="border-b-2 border-foreground pb-3 text-base font-semibold text-foreground"
          >
            타임라인
          </button>
          <span className="pb-3 text-base text-muted">첨부</span>
        </div>
      ) : null}
      <div className="flex items-center gap-3 px-4 py-3 sm:px-6">
        <span className="text-base font-semibold tabular-nums text-foreground">
          {HELP_FIG_TIMELINE.duration}
        </span>
        <div className="flex h-12 flex-1 items-center gap-2 rounded-xl bg-surface-2 px-3 text-base text-muted">
          <Search className="h-4 w-4" />
          검색
        </div>
      </div>
      <ul className="relative min-h-0 flex-1 space-y-6 overflow-hidden px-4 pb-6 before:absolute before:bottom-8 before:left-[2.15rem] before:top-2 before:w-px before:bg-border sm:px-6">
        {HELP_FIG_TIMELINE.segments.map((seg) => {
          const Icon =
            seg.kind === "agenda" ? ClipboardList : MessageSquare;
          return (
            <li key={seg.time} className="relative flex gap-3 pl-1">
              <div className="relative z-10 flex w-14 shrink-0 flex-col items-center">
                <span className="font-mono text-sm font-semibold tabular-nums text-muted">
                  {seg.time}
                </span>
                <span
                  className={cn(
                    "mt-1 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 ring-2 ring-border",
                    seg.kind === "agenda"
                      ? "text-[#3d6a8a]"
                      : "text-[#5c6570]",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className="mt-1 text-sm font-semibold text-muted">
                  {seg.kindLabel}
                </span>
              </div>
              <div className="min-w-0 flex-1 rounded-2xl bg-card px-4 py-3 shadow-soft ring-1 ring-border/50">
                <p className="text-lg font-semibold text-foreground">
                  {seg.title}
                </p>
                <p className="mt-1 text-base leading-relaxed text-muted">
                  {seg.summary}
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-base text-foreground">
                  {seg.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <ul className="mt-3 space-y-2">
                  {seg.speakers.map((s) => (
                    <li key={s.name + s.said} className="flex gap-2">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="bg-[#3d6a8a] text-sm font-semibold text-white">
                          {s.name.slice(0, 1)}
                        </AvatarFallback>
                      </Avatar>
                      <p className="text-base leading-6">
                        <span className="font-semibold text-foreground">
                          {s.name}
                        </span>{" "}
                        <span className="text-muted">{s.said}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex h-full flex-col bg-background">
        <MobileTopBar title="3분기 마케팅 캠페인 킥오프" />
        {panel}
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      <FigSidebar />
      <div className="mx-auto flex min-w-0 max-w-3xl flex-1 flex-col overflow-hidden py-2">
        {panel}
      </div>
    </div>
  );
}

function MaskingScene({ vp }: { vp: HelpFigVp }) {
  const isMobile = vp === "mobile";
  const maskedLine = HELP_FIG_MASKING.lines.find((l) => l.mask)!;
  const matches = useMemo(
    () => maskPii(maskedLine.text, { style: "partial" }).matches,
    [maskedLine.text],
  );

  const chat = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {!isMobile ? (
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <ChevronLeft className="h-5 w-5" />
          <span className="text-base font-semibold">돌아가기</span>
        </div>
      ) : null}
      <div className="faith-chat-pane min-h-0 flex-1 space-y-4 overflow-hidden px-4 py-5 sm:px-8">
        {HELP_FIG_MASKING.lines.map((line) => {
          const mine = line.side === "left";
          return (
            <div
              key={line.time + line.speaker.name}
              className={cn("flex gap-2.5", !mine && "flex-row-reverse")}
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback
                  className={cn(
                    "text-sm font-semibold text-white",
                    line.speaker.color,
                  )}
                >
                  {line.speaker.initial}
                </AvatarFallback>
              </Avatar>
              <div className={cn("faith-chat-bubble-rail min-w-0", !mine && "text-right")}>
                <p className="mb-1.5 flex items-baseline gap-1.5 text-sm font-semibold text-foreground">
                  <span>{line.speaker.name}</span>
                  <span className="font-mono text-xs font-medium tabular-nums text-muted">
                    {line.time}
                  </span>
                </p>
                <div
                  className={cn(
                    "inline-block rounded-2xl px-3.5 py-2.5 text-left text-base font-medium leading-relaxed",
                    mine
                      ? "rounded-bl-md bg-primary text-primary-foreground"
                      : "rounded-br-md bg-surface text-foreground ring-1 ring-border",
                  )}
                >
                  {line.mask ? (
                    <MaskedText
                      original={line.text}
                      matches={matches}
                      onPrimary={mine}
                    />
                  ) : (
                    line.text
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div className="flex h-full flex-col bg-background">
        <MobileTopBar title={HELP_FIG_MASKING.meetingTitle} />
        {chat}
      </div>
    );
  }

  return (
    <div className="flex h-full bg-background">
      <FigSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">{chat}</div>
    </div>
  );
}

export function HelpFiguresClient({
  scene,
  vp,
}: {
  scene: HelpFigScene;
  vp: HelpFigVp;
}) {
  const { w, h } = FRAME[vp];

  return (
    <div
      data-help-figure
      data-scene={scene}
      data-vp={vp}
      className="overflow-hidden bg-background"
      style={{ width: w, height: h }}
    >
      {scene === "home" ? <HomeScene vp={vp} /> : null}
      {scene === "timeline" ? <TimelineScene vp={vp} /> : null}
      {scene === "masking" ? <MaskingScene vp={vp} /> : null}
    </div>
  );
}
