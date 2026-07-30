"use client";

import { Mic } from "lucide-react";

import { ReplayStage } from "@/components/design/preview-stage";
import { RunningDots } from "@/components/meetings/live-masking-transcript";
import { MaskedText } from "@/components/meetings/masked-text";
import {
  ChatBubble,
  RecordBeatBars,
} from "@/components/meetings/new-meeting-session";
import { LoadingMark } from "@/components/ui/loading-mark";
import { maskPii } from "@/lib/masking";

/** 실시간 기록 화면 골격 */
function LiveSessionChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-full flex-col bg-white">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-foreground">
            새 회의
          </p>
          <p className="text-base text-muted">실시간 기록</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
          <Mic className="h-3.5 w-3.5" strokeWidth={2} />
          녹음
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </div>
  );
}

/** mask-chip-in — 채팅 전체 화면 안 가림 칩 */
export function SceneAnimMaskChipIn() {
  const text = "담당 번호는 010-2847-3916 입니다.";
  const matches = maskPii(text, { style: "partial" }).matches;
  return (
    <ReplayStage
      hint="실시간 기록 화면, 가림 칩 등장."
      fill
      autoReplayMs={2800}
    >
      {() => (
        <LiveSessionChrome>
          <div className="flex flex-col gap-3.5">
            <ChatBubble
              side="right"
              name="김서연"
              initial="김"
              team="디자인팀"
              content="오늘 안건은 예산 심사입니다."
              maskStyle="partial"
            />
            <div className="flex w-full justify-end">
              <div className="max-w-[min(85%,22rem)] animate-[bubble-in_320ms_ease-out] rounded-2xl bg-primary px-3.5 py-2.5 text-left text-base font-medium leading-relaxed text-primary-foreground motion-reduce:animate-none md:text-[15px]">
                <MaskedText
                  original={text}
                  matches={matches}
                  onPrimary
                />
              </div>
            </div>
          </div>
        </LiveSessionChrome>
      )}
    </ReplayStage>
  );
}

/** bubble-in — 채팅 전체 화면 말풍선 */
export function SceneAnimBubbleIn() {
  return (
    <ReplayStage
      hint="실시간 기록 화면, 말풍선 등장."
      fill
      autoReplayMs={2600}
    >
      {() => (
        <LiveSessionChrome>
          <div className="space-y-3">
            <ChatBubble
              side="right"
              name="김서연"
              initial="김"
              team="디자인팀"
              content="오늘 안건은 예산 심사입니다."
              maskStyle="partial"
            />
            <ChatBubble
              side="left"
              name="나"
              initial="나"
              content="네, 먼저 일정부터 맞출게요."
              maskStyle="partial"
            />
          </div>
        </LiveSessionChrome>
      )}
    </ReplayStage>
  );
}

/** record-beat — 녹음 중 하단 독 맥락 */
export function SceneAnimRecordBeat() {
  return (
    <ReplayStage
      hint="실시간 기록 화면, 녹음 비트."
      fill
      autoReplayMs={3200}
    >
      {() => (
        <div className="flex h-full min-h-full flex-col bg-white">
          <header className="shrink-0 border-b border-border px-4 py-3">
            <p className="text-lg font-semibold text-foreground">새 회의</p>
            <p className="text-base text-muted">실시간 기록</p>
          </header>
          <div className="min-h-0 flex-1 px-4 py-4">
            <p className="py-10 text-center text-base text-muted">
              발화가 쌓이는 영역
            </p>
          </div>
          <div className="shrink-0 border-t border-border bg-card px-4 py-4">
            <div className="flex items-center justify-center gap-3 rounded-2xl bg-primary px-6 py-5 text-primary-foreground shadow-soft">
              <RecordBeatBars />
              <span className="text-base font-semibold">녹음 중</span>
            </div>
          </div>
        </div>
      )}
    </ReplayStage>
  );
}

/** running-dots — 입력 중 점, 채팅 맥락 */
export function SceneAnimRunningDots() {
  return (
    <ReplayStage
      hint="실시간 기록 화면, 입력 중 점."
      fill
      autoReplayMs={2800}
    >
      {() => (
        <LiveSessionChrome>
          <div className="space-y-3">
            <ChatBubble
              side="right"
              name="김서연"
              initial="김"
              team="디자인팀"
              content="이어서 말씀해 주세요."
              maskStyle="partial"
            />
            <div className="flex justify-end">
              <div className="inline-flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-base text-primary-foreground shadow-soft">
                <span>입력 중</span>
                <RunningDots />
              </div>
            </div>
          </div>
        </LiveSessionChrome>
      )}
    </ReplayStage>
  );
}

/** faith-loading-ring — 목록 화면 불러오는 중 */
export function SceneAnimLoadingMark() {
  return (
    <ReplayStage
      hint="회의 목록 화면, 불러오는 중."
      fill
      autoReplayMs={3000}
    >
      {() => (
        <div className="flex h-full min-h-full flex-col bg-background p-4 sm:p-6">
          <p className="text-xl font-semibold text-foreground">회의 기록</p>
          <p className="mt-1 text-base text-muted">최근 업로드·실시간 기록</p>
          <div className="mt-4 grid min-h-40 flex-1 place-items-center rounded-3xl bg-card px-6 shadow-soft ring-1 ring-border">
            <LoadingMark />
          </div>
          <div className="mt-3 flex justify-center">
            <div className="rounded-full bg-card px-3 py-1.5 shadow-soft ring-1 ring-border">
              <LoadingMark size="sm" />
            </div>
          </div>
        </div>
      )}
    </ReplayStage>
  );
}
