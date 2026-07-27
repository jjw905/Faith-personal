/**
 * 목업 회의 대화기록에 보정 추천을 붙인다 (로컬 확인용).
 * 본문은 고치지 않고 corrections 만 추가한다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/seed-term-corrections.ts mtg-cmp-mini mtg-cmp-faster
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";

import { suggestTermCorrections } from "../src/lib/stt/term-suggest";

config({ path: ".env.local" });
config();

type Line = {
  text?: string;
  corrections?: Array<{ wrong: string; suggestion: string; reason?: string }>;
};

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("회의 id를 넘겨주세요.");
    process.exit(1);
  }

  const path = join(process.cwd(), "src/mocks/meeting-transcripts.json");
  const data = JSON.parse(readFileSync(path, "utf8")) as {
    transcripts: Record<string, { lines: Line[] }>;
  };

  for (const id of ids) {
    const target = data.transcripts[id];
    if (!target) {
      console.log(`${id}: 없음`);
      continue;
    }
    const lines = target.lines.map((l) => l.text ?? "");
    const { suggestions, usage } = await suggestTermCorrections(lines);
    for (const line of target.lines) delete line.corrections;
    for (const s of suggestions) {
      const line = target.lines[s.lineIndex];
      if (!line) continue;
      line.corrections = [
        ...(line.corrections ?? []),
        { wrong: s.wrong, suggestion: s.suggestion, reason: s.reason },
      ];
    }
    console.log(
      `${id}: 추천 ${suggestions.length}건, $${usage.estimatedUsd.toFixed(5)}`,
    );
  }

  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log("저장 완료");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
