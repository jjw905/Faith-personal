/**
 * 말풍선 인플레이스 편집 — 크기 고정·편집 가능 조건 일일히 검사.
 * 실행: npm run test:chat-bubble-edit
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  bubbleEditLockStyle,
  bubbleEditSizeUnchanged,
  canStartBubbleTextEdit,
  lockBubbleEditSize,
} from "../src/lib/chat-bubble-edit";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function scenario(name: string, fn: () => void) {
  fn();
  console.log(`ok — ${name}`);
}

scenario("1. lock: 소수점 → round, 최소 1px", () => {
  assert.deepEqual(lockBubbleEditSize({ width: 120.2, height: 44.1 }), {
    w: 120,
    h: 44,
  });
  assert.deepEqual(lockBubbleEditSize({ width: 120.6, height: 44.6 }), {
    w: 121,
    h: 45,
  });
  assert.deepEqual(lockBubbleEditSize({ width: 0, height: 0 }), { w: 1, h: 1 });
});

scenario("2. style: width/height/min/max 전부 동일 잠금 + border-box", () => {
  const lock = lockBubbleEditSize({ width: 200, height: 64 });
  const style = bubbleEditLockStyle(lock);
  assert.equal(style.width, 200);
  assert.equal(style.height, 64);
  assert.equal(style.minWidth, 200);
  assert.equal(style.minHeight, 64);
  assert.equal(style.maxWidth, 200);
  assert.equal(style.maxHeight, 64);
  assert.equal(style.boxSizing, "border-box");
});

scenario("3. 편집 가능: canEdit+텍스트+정지+메모아님", () => {
  assert.equal(
    canStartBubbleTextEdit({
      canEditText: true,
      hasText: true,
      playing: false,
      editingMemo: false,
    }),
    true,
  );
});

scenario("4. 재생 중이면 편집 불가", () => {
  assert.equal(
    canStartBubbleTextEdit({
      canEditText: true,
      hasText: true,
      playing: true,
      editingMemo: false,
    }),
    false,
  );
});

scenario("5. 권한 없으면 편집 불가", () => {
  assert.equal(
    canStartBubbleTextEdit({
      canEditText: false,
      hasText: true,
      playing: false,
      editingMemo: false,
    }),
    false,
  );
});

scenario("6. 빈 대사면 편집 불가", () => {
  assert.equal(
    canStartBubbleTextEdit({
      canEditText: true,
      hasText: false,
      playing: false,
      editingMemo: false,
    }),
    false,
  );
});

scenario("7. 메모 편집 중이면 대사 편집 불가", () => {
  assert.equal(
    canStartBubbleTextEdit({
      canEditText: true,
      hasText: true,
      playing: false,
      editingMemo: true,
    }),
    false,
  );
});

scenario("8. 잠금 후 측정값이 같으면 unchanged", () => {
  const lock = lockBubbleEditSize({ width: 180.4, height: 52.2 });
  assert.ok(
    bubbleEditSizeUnchanged(lock, { width: lock.w, height: lock.h }),
  );
});

scenario("9. 잠금보다 커지면 실패(늘어남 감지)", () => {
  const lock = lockBubbleEditSize({ width: 100, height: 40 });
  assert.equal(
    bubbleEditSizeUnchanged(lock, { width: 140, height: 40 }),
    false,
  );
  assert.equal(
    bubbleEditSizeUnchanged(lock, { width: 100, height: 80 }),
    false,
  );
});

scenario("10. 짧은·긴·다줄·마스킹 후보 폭별 잠금 일관성", () => {
  const samples = [
    { width: 72, height: 40 },
    { width: 160, height: 44 },
    { width: 280, height: 88 },
    { width: 320.7, height: 120.3 },
    { width: 18, height: 36 },
  ];
  for (const s of samples) {
    const lock = lockBubbleEditSize(s);
    const style = bubbleEditLockStyle(lock);
    assert.equal(style.width, style.maxWidth);
    assert.equal(style.height, style.maxHeight);
    assert.ok(
      bubbleEditSizeUnchanged(lock, {
        width: style.width,
        height: style.height,
      }),
      `sample ${JSON.stringify(s)}`,
    );
  }
});

scenario("11. UI 연결: lock helper · useLayoutEffect · textarea 고정", () => {
  const chat = read("src/components/meetings/meeting-chat-replay.tsx");
  assert.match(chat, /lockBubbleEditSize/);
  assert.match(chat, /bubbleEditLockStyle/);
  assert.match(chat, /useLayoutEffect/);
  assert.match(chat, /canStartBubbleTextEdit/);
  assert.match(chat, /textEditRef/);
  assert.match(chat, /<textarea/);
  assert.doesNotMatch(chat, /contentEditable=\{/);
});

scenario("12. 편집 시 대사는 value 로 유지 (빈 children 금지)", () => {
  const chat = read("src/components/meetings/meeting-chat-replay.tsx");
  assert.match(chat, /value=\{textDraft\}/);
  assert.match(chat, /setTextDraft\(text\)/);
  assert.doesNotMatch(chat, /editingText \? null :/);
});

scenario("13. 메모 토글은 뷰포트 미디어(컨테이너 md 혼동 방지)", () => {
  const chat = read("src/components/meetings/meeting-chat-replay.tsx");
  assert.match(chat, /@media\(max-width:767px\)\]:inline-flex/);
  assert.match(chat, /@media\(min-width:768px\)\]:inline-flex/);
  assert.doesNotMatch(
    chat,
    /inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-base font-semibold text-muted[\s\S]{0,80}md:hidden/,
  );
});

console.log("\nchat-bubble-edit: all scenarios passed");
