/**
 * 실제 회의록으로 마스킹 오탐을 잰다.
 *
 * 규칙 마스킹은 성씨로 시작하는 흔한 말을 이름으로 착각하기 쉽다. 지어낸
 * 예문이 아니라 실제 브리핑 녹취로 확인해야 의미가 있다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/test-masking-real-transcripts.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { maskPii } from "../src/lib/masking/mask";

const SOURCES = [
  join(homedir(), "Downloads", "ktv-briefing-20251231 (1).txt"),
  join(homedir(), "Downloads", "brief-startup.txt"),
  join(homedir(), "Downloads", "brief-ailab.txt"),
  join(homedir(), "Downloads", "brief-mou.txt"),
];

/** 화자 표시 줄은 녹취 도구가 붙인 것이라 본문이 아니다. */
const SPEAKER_LINE = /^참석자\s+\d+\s+\d{2}:\d{2}$/;

function bodyLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !SPEAKER_LINE.test(line));
}

function main() {
  let totalLines = 0;
  const byType = new Map<string, Map<string, number>>();

  for (const path of SOURCES) {
    if (!existsSync(path)) {
      console.log(`건너뜀 (없음): ${path}`);
      continue;
    }
    const name = path.slice(path.lastIndexOf("/") + 1);
    const lines = bodyLines(readFileSync(path, "utf8"));
    totalLines += lines.length;

    let hits = 0;
    for (const line of lines) {
      const result = maskPii(line, { style: "label" });
      for (const match of result.matches) {
        hits += 1;
        const bucket = byType.get(match.type) ?? new Map<string, number>();
        bucket.set(match.value, (bucket.get(match.value) ?? 0) + 1);
        byType.set(match.type, bucket);
      }
    }
    console.log(`${name.padEnd(32)} ${String(lines.length).padStart(4)}줄  탐지 ${hits}건`);
  }

  console.log(`\n총 ${totalLines}줄\n`);
  for (const [type, values] of [...byType.entries()].sort()) {
    const items = [...values.entries()].sort((a, b) => b[1] - a[1]);
    const total = items.reduce((sum, [, n]) => sum + n, 0);
    console.log(`[${type}] ${total}건`);
    for (const [value, count] of items.slice(0, 40)) {
      console.log(`   ${String(count).padStart(3)}회  ${value}`);
    }
    if (items.length > 40) console.log(`   … 외 ${items.length - 40}종`);
  }
}

main();
