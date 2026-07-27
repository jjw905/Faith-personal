"use client";

import { useState, type ReactNode } from "react";

import { RunningDots } from "@/components/meetings/live-masking-transcript";
import { MaskedText } from "@/components/meetings/masked-text";
import {
  ChatBubble,
  RecordBeatBars,
} from "@/components/meetings/new-meeting-session";
import { Button } from "@/components/ui/button";
import { LoadingMark } from "@/components/ui/loading-mark";
import { maskPii } from "@/lib/masking";

function ReplayStage({
  hint,
  children,
}: {
  hint: string;
  children: (play: number) => ReactNode;
}) {
  const [play, setPlay] = useState(0);
  return (
    <div className="flex h-full min-h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm text-muted">{hint}</p>
        <Button type="button" size="sm" onClick={() => setPlay((n) => n + 1)}>
          재생
        </Button>
      </div>
      <div
        key={play}
        className="flex min-h-0 flex-1 flex-col justify-center px-6 pb-8 pt-4"
      >
        {children(play)}
      </div>
    </div>
  );
}

/** mask-chip-in — 제품 MaskedText */
export function SceneAnimMaskChipIn() {
  const text = "담당 번호는 010-2847-3916 입니다.";
  const matches = maskPii(text, { style: "partial" }).matches;
  return (
    <ReplayStage hint="가림 칩이 나타날 때.">
      {() => (
        <p className="rounded-2xl bg-card px-4 py-3 text-sm leading-relaxed text-foreground shadow-soft">
          <MaskedText original={text} matches={matches} />
        </p>
      )}
    </ReplayStage>
  );
}

/** bubble-in — 실시간 기록 ChatBubble */
export function SceneAnimBubbleIn() {
  return (
    <ReplayStage hint="채팅 말풍선이 아래에서 올라옵니다.">
      {() => (
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
      )}
    </ReplayStage>
  );
}

/** record-beat — 녹음 중 */
export function SceneAnimRecordBeat() {
  return (
    <ReplayStage hint="녹음 중 비트 막대.">
      {() => (
        <div className="flex items-center justify-center gap-3 rounded-2xl bg-primary px-6 py-5 text-primary-foreground shadow-soft">
          <RecordBeatBars />
          <span className="text-sm font-semibold">녹음 중</span>
        </div>
      )}
    </ReplayStage>
  );
}

/** running-dots — 입력 중 */
export function SceneAnimRunningDots() {
  return (
    <ReplayStage hint="입력 중 점 애니메이션.">
      {() => (
        <div className="inline-flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm text-muted shadow-soft">
          <span>입력 중</span>
          <RunningDots />
        </div>
      )}
    </ReplayStage>
  );
}

/** faith-loading-ring — 목록·패널 불러오는 중 */
export function SceneAnimLoadingMark() {
  return (
    <ReplayStage hint="불러오는 중. 얇은 링과 점.">
      {() => (
        <div className="flex flex-col items-center gap-6">
          <div className="grid min-h-40 w-full max-w-md place-items-center rounded-3xl bg-card px-6 shadow-soft">
            <LoadingMark />
          </div>
          <div className="rounded-full bg-card px-3 py-1.5 shadow-soft">
            <LoadingMark size="sm" />
          </div>
        </div>
      )}
    </ReplayStage>
  );
}
