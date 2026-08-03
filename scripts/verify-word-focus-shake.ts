/**
 * 단어 포커스 흔들림 회귀 검증.
 * - 단어마다 scrollIntoView 금지 (스크롤 지터)
 * - .word-play-mark 패딩/마진 0 (인라인 메트릭 유지)
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { activeWordFocusAt } from "../src/lib/transcript-time";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed += 1;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`ok: ${msg}`);
  }
}

const root = process.cwd();
const replay = readFileSync(
  path.join(root, "src/components/meetings/meeting-chat-replay.tsx"),
  "utf8",
);
const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");

assert(
  !/data-word-play-mark[\s\S]{0,200}scrollIntoView/.test(replay) &&
    !/querySelector\([\s\S]*word-play-mark[\s\S]*scrollIntoView/.test(replay),
  "no per-word mark.scrollIntoView",
);

assert(
  /scrollIntoView\(\{\s*block:\s*"nearest"/.test(replay),
  "line-level follow scroll kept",
);

const markBlock = css.match(/\.word-play-mark\s*\{[^}]+\}/);
assert(Boolean(markBlock), ".word-play-mark rule exists");
if (markBlock) {
  const block = markBlock[0];
  assert(/padding:\s*0/.test(block), "word-play-mark padding: 0");
  assert(/margin:\s*0/.test(block), "word-play-mark margin: 0");
  assert(
    !/padding:\s*0\.\d+em/.test(block),
    "no em padding on word-play-mark",
  );
  assert(/box-shadow:/.test(block), "visual emphasis via box-shadow");
}

/** 패딩 있는 인라인 mark는 폭이 커져 이웃 글리프가 밀린다. */
function layoutWidth(text: string, padEm: number, fontSize = 16) {
  // 근사: 한글 1em ≈ fontSize, 영문 0.5em. 패딩은 양쪽에 padEm*fontSize.
  const base = [...text].reduce(
    (w, ch) => w + (/[가-힣]/.test(ch) ? fontSize : fontSize * 0.5),
    0,
  );
  return base + padEm * fontSize * 2;
}

const sample = "정부";
const withPad = layoutWidth(sample, 0.14);
const noPad = layoutWidth(sample, 0);
assert(withPad > noPad, "padded mark widens text (why shake happened)");
assert(
  Math.abs(layoutWidth(sample, 0) - noPad) < 0.001,
  "zero padding keeps width stable",
);

const words = [
  { text: "강", startSec: 1, endSec: 1.35 },
  { text: "약", startSec: 3, endSec: 3.35 },
];
assert(activeWordFocusAt(words, 0.9) === null, "word does not light before speech");
assert(
  activeWordFocusAt(words, 1.1)?.word.text === "강" &&
    activeWordFocusAt(words, 1.1)?.strength === 1,
  "speaking word has full-strength highlight",
);
const fading = activeWordFocusAt(words, 1.5);
assert(
  fading?.word.text === "강" && fading.strength > 0 && fading.strength < 1,
  "word fades immediately after speech",
);
assert(
  activeWordFocusAt(words, 2.5) === null,
  "previous word is cleared during a long pause",
);

const stretched = [{ text: "이상입니다", startSec: 108.87, endSec: 115.27 }];
assert(
  activeWordFocusAt(stretched, 114) === null,
  "implausibly stretched forced-alignment word does not cover silence",
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nWord-focus shake checks passed.");
