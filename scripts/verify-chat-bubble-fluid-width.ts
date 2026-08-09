/**
 * 대화 말풍선: 채팅 판 컨테이너 비율별로 max-width가 달라진다.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-chat-bubble-fluid-width.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const css = read("src/app/globals.css");
const replay = read("src/components/meetings/meeting-chat-replay.tsx");
const session = read("src/components/meetings/new-meeting-session.tsx");
const liveMask = read("src/components/meetings/live-masking-transcript.tsx");

assert.match(css, /\.faith-chat-pane\s*\{[^}]*container-type:\s*inline-size/s);
assert.match(css, /container-name:\s*chat-pane/);
assert.match(css, /\.faith-chat-bubble-rail\s*\{[^}]*max-width:\s*min\(92cqi,\s*16\.5rem\)/s);
assert.match(css, /@container chat-pane \(min-width: 28rem\)/);
assert.match(css, /@container chat-pane \(min-width: 40rem\)/);
assert.match(css, /@container chat-pane \(min-width: 52rem\)/);
assert.match(css, /max-width:\s*min\(78cqi,\s*22rem\)/);
assert.match(css, /max-width:\s*min\(62cqi,\s*26rem\)/);
assert.match(css, /max-width:\s*min\(52cqi,\s*30rem\)/);

assert.match(replay, /faith-chat-pane/);
assert.match(replay, /faith-chat-bubble-rail/);
assert.doesNotMatch(replay, /max-w-\[min\(85%,clamp/);
assert.match(session, /faith-chat-pane/);
assert.match(session, /faith-chat-bubble-rail/);
assert.match(liveMask, /faith-chat-pane/);
assert.match(liveMask, /faith-chat-bubble-rail/);

/** 컨테이너 너비별 말풍선 상한(px). CSS 규칙을 수동으로 대응. */
function bubbleCap(panePx: number) {
  if (panePx >= 52 * 16) return Math.min(panePx * 0.52, 30 * 16);
  if (panePx >= 40 * 16) return Math.min(panePx * 0.62, 26 * 16);
  if (panePx >= 28 * 16) return Math.min(panePx * 0.78, 22 * 16);
  return Math.min(panePx * 0.92, 16.5 * 16);
}

const scenarios = [
  { name: "mobile-pane-360", pane: 360, expectMin: 240, expectMax: 280 },
  { name: "mobile-pane-430", pane: 430, expectMin: 250, expectMax: 280 },
  { name: "tablet-pane-500", pane: 500, expectMin: 300, expectMax: 360 },
  { name: "desktop-pane-720", pane: 720, expectMin: 380, expectMax: 430 },
  { name: "wide-pane-960", pane: 960, expectMin: 450, expectMax: 500 },
];

let prev = 0;
for (const s of scenarios) {
  const cap = bubbleCap(s.pane);
  assert.ok(
    cap >= s.expectMin && cap <= s.expectMax,
    `${s.name}: ${cap.toFixed(1)}px (기대 ${s.expectMin}~${s.expectMax})`,
  );
  assert.ok(cap + 0.5 >= prev, `${s.name}: 판이 커지면 상한도 비감소`);
  prev = cap;
  console.log(`ok — ${s.name}: pane ${s.pane} → bubble max ≈ ${Math.round(cap)}px`);
}

console.log("verify-chat-bubble-fluid-width: all ok");
