/**
 * 채팅 다시듣기 헤더: 가로폭별 1줄/스택 + 환경별 본문폭 동적 판정.
 * 실행: npm run test:chat-replay-header
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CHAT_REPLAY_HEADER_HYSTERESIS_PX,
  CHAT_REPLAY_LAYOUT_ENVS,
  CHAT_REPLAY_LEADING_WIDTH_PX,
  CHAT_REPLAY_TITLE_MIN_WIDTH_PX,
  chatReplayContentWidth,
  chatReplayHeaderNeededWidth,
  estimateChatReplayTrailingWidth,
  resolveChatReplayHeaderMode,
} from "../src/lib/chat-replay-header-layout";
import { SIDEBAR_RAIL_MIN_WIDTH_PX } from "../src/lib/sidebar-layout";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function scenario(name: string, fn: () => void) {
  fn();
  console.log(`ok — ${name}`);
}

scenario("겹치기 전 single, 부족하면 stacked", () => {
  const leading = CHAT_REPLAY_LEADING_WIDTH_PX;
  const trailing = 280;
  const needed = chatReplayHeaderNeededWidth({
    containerWidth: 0,
    leadingWidth: leading,
    trailingWidth: trailing,
  });
  assert.equal(
    resolveChatReplayHeaderMode({
      containerWidth: needed,
      leadingWidth: leading,
      trailingWidth: trailing,
    }),
    "single",
  );
  assert.equal(
    resolveChatReplayHeaderMode({
      containerWidth: needed - 1,
      leadingWidth: leading,
      trailingWidth: trailing,
    }),
    "stacked",
  );
});

scenario("히스테리시스: stacked에서 살짝 넓혀도 유지", () => {
  const leading = 100;
  const trailing = 200;
  const needed = chatReplayHeaderNeededWidth({
    containerWidth: 0,
    leadingWidth: leading,
    trailingWidth: trailing,
  });
  assert.equal(
    resolveChatReplayHeaderMode(
      {
        containerWidth: needed + CHAT_REPLAY_HEADER_HYSTERESIS_PX - 1,
        leadingWidth: leading,
        trailingWidth: trailing,
      },
      "stacked",
    ),
    "stacked",
  );
  assert.equal(
    resolveChatReplayHeaderMode(
      {
        containerWidth: needed + CHAT_REPLAY_HEADER_HYSTERESIS_PX,
        leadingWidth: leading,
        trailingWidth: trailing,
      },
      "stacked",
    ),
    "single",
  );
});

scenario("환경별 동적 렌더: 본문폭·모드 (편집 on/off)", () => {
  const rows: string[] = [];
  for (const env of CHAT_REPLAY_LAYOUT_ENVS) {
    if (
      env.viewportWidth < SIDEBAR_RAIL_MIN_WIDTH_PX &&
      env.sidebar !== "none"
    ) {
      assert.fail(`${env.id}: md 미만은 sidebar none만`);
    }
    const containerWidth = chatReplayContentWidth(env);
    for (const canEdit of [false, true]) {
      const trailingWidth = estimateChatReplayTrailingWidth({
        viewportWidth: env.viewportWidth,
        canEdit,
      });
      const mode = resolveChatReplayHeaderMode({
        containerWidth,
        leadingWidth: CHAT_REPLAY_LEADING_WIDTH_PX,
        trailingWidth,
        titleMinWidth: CHAT_REPLAY_TITLE_MIN_WIDTH_PX,
      });
      const needed = chatReplayHeaderNeededWidth({
        containerWidth,
        leadingWidth: CHAT_REPLAY_LEADING_WIDTH_PX,
        trailingWidth,
      });
      // 판정과 needed 관계 일관
      if (containerWidth >= needed) assert.equal(mode, "single");
      else assert.equal(mode, "stacked");

      rows.push(
        `${env.id} edit=${canEdit ? 1 : 0} cw=${containerWidth} need=${needed} → ${mode}`,
      );
    }
  }
  // 모바일은 도구가 줄어도 제목+돌아가기+도구로 좁으면 스택이 자연스러움
  const mobile = rows.filter((r) => r.startsWith("mobile-375"));
  assert.ok(mobile.length === 2);
  // 넓은 데스크톱 레일은 1줄
  const wide = rows.find((r) =>
    r.startsWith("desktop-1440-rail edit=0"),
  );
  assert.ok(wide?.endsWith("single"), wide);
  for (const line of rows) console.log(`  ${line}`);
});

scenario("좁은 폭은 stacked, 넓은 폭은 single (연속 스윕)", () => {
  const trailing = estimateChatReplayTrailingWidth({
    viewportWidth: 1280,
    canEdit: true,
  });
  let sawStack = false;
  let sawSingle = false;
  let prev: "single" | "stacked" | undefined;
  for (let w = 280; w <= 1200; w += 40) {
    const mode = resolveChatReplayHeaderMode(
      {
        containerWidth: w,
        leadingWidth: CHAT_REPLAY_LEADING_WIDTH_PX,
        trailingWidth: trailing,
      },
      prev,
    );
    prev = mode;
    if (mode === "stacked") sawStack = true;
    if (mode === "single") sawSingle = true;
  }
  assert.ok(sawStack && sawSingle);
});

scenario("UI 연결: ChatReplayHeaderBar + 테두리 제거 + 첨부 메모 라벨 없음", () => {
  const chat = read("src/components/meetings/meeting-chat-replay.tsx");
  assert.match(chat, /ChatReplayHeaderBar/);
  assert.doesNotMatch(chat, /ring-1 ring-border\/50/);
  assert.doesNotMatch(
    chat,
    /!text && line\.attachment && !hasMemo[\s\S]*?메모 추가/,
  );
  const bar = read("src/components/meetings/chat-replay-header-bar.tsx");
  assert.match(bar, /data-chat-header-mode/);
  assert.match(bar, /ResizeObserver/);
});

console.log("\nchat-replay-header-layout: all scenarios passed");
