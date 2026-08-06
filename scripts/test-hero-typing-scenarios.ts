/**
 * 브랜딩 홈 히어로 「… AI가.」 타이핑 — 시나리오별 회귀.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  HERO_TITLE_FULL,
  HERO_TITLE_LINES,
  HERO_TYPE_START_MS,
  HERO_TYPE_STEP_MS,
  heroTypedCountAt,
  heroTypingDoneAtMs,
  heroTypingLines,
  heroTypingSnapshot,
} from "../src/lib/marketing/hero-typing";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function scenario(name: string, fn: () => void) {
  fn();
  console.log(`ok — ${name}`);
}

scenario("문구 · AI가. 로 끝나는 4줄", () => {
  assert.equal(HERO_TITLE_LINES.length, 4);
  assert.equal(HERO_TITLE_LINES[3], "AI가.");
  assert.ok(HERO_TITLE_FULL.includes("말만 하면 회의록,"));
  assert.ok(HERO_TITLE_FULL.endsWith("AI가."));
});

scenario("시나리오 · 모션 감소 → 즉시 완성, 커서 없음", () => {
  const snap = heroTypingSnapshot({ elapsedMs: 0, reduceMotion: true });
  assert.equal(snap.phase, "done");
  assert.equal(snap.visibleText, HERO_TITLE_FULL);
  assert.equal(snap.showCaret, false);
  assert.equal(snap.done, true);
});

scenario("시나리오 · 강제 완성(탭 복귀/끊김) → 빈 | 방지", () => {
  const snap = heroTypingSnapshot({ elapsedMs: 100, forceComplete: true });
  assert.equal(snap.phase, "done");
  assert.equal(snap.visibleText, HERO_TITLE_FULL);
  assert.equal(snap.showCaret, false);
});

scenario("시나리오 · 시작 전 대기 → idle + 커서", () => {
  const snap = heroTypingSnapshot({ elapsedMs: HERO_TYPE_START_MS - 1 });
  assert.equal(snap.phase, "idle");
  assert.equal(snap.visibleText, "");
  assert.equal(snap.showCaret, true);
  assert.equal(heroTypedCountAt(HERO_TYPE_START_MS - 1), 0);
});

scenario("시나리오 · 타이핑 중 글자 수 증가", () => {
  const atFirst = heroTypingSnapshot({ elapsedMs: HERO_TYPE_START_MS });
  assert.equal(atFirst.phase, "typing");
  assert.equal(atFirst.count, 1);
  assert.equal(atFirst.visibleText, HERO_TITLE_FULL.slice(0, 1));
  assert.equal(atFirst.showCaret, true);

  const later = heroTypingSnapshot({
    elapsedMs: HERO_TYPE_START_MS + HERO_TYPE_STEP_MS * 10,
  });
  assert.equal(later.count, 11);
  assert.ok(later.visibleText.length === 11);
  assert.equal(later.phase, "typing");
});

scenario("시나리오 · 줄바꿈 포함 진행", () => {
  const idx = HERO_TITLE_FULL.indexOf("\n");
  assert.ok(idx > 0);
  const elapsed =
    HERO_TYPE_START_MS + (idx + 1 - 1) * HERO_TYPE_STEP_MS;
  const snap = heroTypingSnapshot({ elapsedMs: elapsed });
  assert.ok(snap.visibleText.includes("\n"));
  const lines = heroTypingLines(snap.visibleText);
  assert.ok(lines.length >= 2);
});

scenario("시나리오 · 완료 시각 이후 → done, 커서 제거", () => {
  const doneAt = heroTypingDoneAtMs();
  const snap = heroTypingSnapshot({ elapsedMs: doneAt });
  assert.equal(snap.phase, "done");
  assert.equal(snap.done, true);
  assert.equal(snap.showCaret, false);
  assert.equal(snap.visibleText, HERO_TITLE_FULL);
});

scenario("시나리오 · 마지막 글자~홀드 구간은 전체 문구+커서", () => {
  const lastCharAt =
    HERO_TYPE_START_MS + (HERO_TITLE_FULL.length - 1) * HERO_TYPE_STEP_MS;
  const snap = heroTypingSnapshot({ elapsedMs: lastCharAt });
  assert.equal(snap.visibleText, HERO_TITLE_FULL);
  assert.equal(snap.showCaret, true);
  assert.equal(snap.done, false);
  assert.equal(snap.phase, "typing");
});

scenario("컴포넌트 · 타이핑 오버레이 + caret + 높이 고정", () => {
  const src = read("src/components/marketing/hero-typing-title.tsx");
  assert.match(src, /heroTypingSnapshot/);
  assert.match(src, /hero-caret/);
  assert.match(src, /invisible/);
  assert.match(src, /visibilitychange/);
  assert.match(src, /forceComplete:\s*true/);
  assert.match(src, /HERO_TITLE_LINES/);
  assert.match(src, /AI가\./);
});

scenario("CSS · caret blink + reduced-motion", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /\.hero-caret/);
  assert.match(css, /hero-caret-blink/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.hero-caret/);
});

scenario("홈 · HeroIntro가 HeroTypingTitle 사용", () => {
  const intro = read("src/components/marketing/hero-intro.tsx");
  assert.match(intro, /HeroTypingTitle/);
  const page = read("src/app/page.tsx");
  assert.match(page, /Hero/);
});

console.log("\nall ok — hero typing scenarios");
