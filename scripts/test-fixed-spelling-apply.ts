/**
 * 정해진 표기를 본문에 적용할 때 단어 시각이 어긋나지 않는지 본다.
 *
 * 단어 시각은 본문 안 위치(offset)로 잡혀 있다. 글자 수가 달라지는 표기로
 * 바꾸면 뒤 단어가 통째로 밀려 형광펜이 엉뚱한 자리에 붙는다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/test-fixed-spelling-apply.ts
 */
import { applyFixedSpellings } from "../src/lib/stt/term-suggest";
import { MEDIA_OUTLET_TERMS } from "../src/lib/stt/media-outlets";
import type { TranscriptLine } from "../src/types/transcript";

function words(text: string, from = 0) {
  let cursor = 0;
  return text.split(" ").map((token, index) => {
    const startOffset = text.indexOf(token, cursor);
    cursor = startOffset + token.length;
    return {
      text: token,
      startSec: from + index,
      endSec: from + index + 1,
      startOffset,
      endOffset: cursor,
    };
  });
}

function line(id: string, text: string): TranscriptLine {
  return { id, time: "00:00", text, words: words(text) };
}

const CASES: Array<{ name: string; text: string; wrong: string; to: string }> = [
  { name: "같은 길이", text: "네 수석님 유시스 김영록입니다", wrong: "유시스", to: "뉴시스" },
  { name: "길어짐", text: "안녕하세요 연합뉴 기자입니다", wrong: "연합뉴", to: "연합뉴스" },
  { name: "짧아짐", text: "저는 아이뉴스24요 소속입니다", wrong: "아이뉴스24요", to: "아이뉴스24" },
];

let failures = 0;
for (const item of CASES) {
  const source = line("l1", item.text);
  const startOffset = item.text.indexOf(item.wrong);
  const [applied] = applyFixedSpellings(
    [source],
    [
      {
        lineIndex: 0,
        wrong: item.wrong,
        suggestion: item.to,
        reason: "테스트",
        similarity: 0.95,
        dictionaryVerified: true,
        startOffset,
        endOffset: startOffset + item.wrong.length,
        source: "glossary",
      },
    ],
    MEDIA_OUTLET_TERMS,
  );

  const text = applied?.text ?? "";
  const expected = item.text.replace(item.wrong, item.to);
  const offsetsOk = (applied?.words ?? []).every(
    (word) => text.slice(word.startOffset, word.endOffset) === word.text,
  );
  const ok = text === expected && offsetsOk;
  if (!ok) failures += 1;
  console.log(`${ok ? "통과" : "실패"}  ${item.name}: ${text}`);
  if (!offsetsOk) {
    for (const word of applied?.words ?? []) {
      const slice = text.slice(word.startOffset, word.endOffset);
      if (slice !== word.text) console.log(`   어긋남 ${word.text} ≠ ${slice}`);
    }
  }
}

// 목록에 없는 추천은 본문을 건드리지 않는다.
const keep = line("l2", "김영록 과장님이 맡습니다");
const [untouched] = applyFixedSpellings(
  [keep],
  [
    {
      lineIndex: 0,
      wrong: "김영록",
      suggestion: "김용록",
      reason: "테스트",
      similarity: 0.95,
      dictionaryVerified: true,
      startOffset: 0,
      endOffset: 3,
      source: "glossary",
    },
  ],
  MEDIA_OUTLET_TERMS,
);
const kept = untouched?.text === keep.text;
if (!kept) failures += 1;
console.log(`${kept ? "통과" : "실패"}  목록 밖 추천은 본문 유지`);

console.log(failures === 0 ? "\n전부 통과" : `\n실패 ${failures}건`);
process.exitCode = failures === 0 ? 0 : 1;
