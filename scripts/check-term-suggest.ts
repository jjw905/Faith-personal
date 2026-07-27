/**
 * 보정 추천 점검. 실제 대화기록 줄에 대해 모델이 무엇을 제안하는지 본다.
 * 원문은 고치지 않는다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/check-term-suggest.ts [meetingId]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";

import { suggestTermCorrections } from "../src/lib/stt/term-suggest";

config({ path: ".env.local" });
config();

type Transcript = {
  meetingId?: string;
  lines: Array<{ text?: string }>;
};

async function main() {
  const wanted = process.argv[2] ?? "";
  const raw = readFileSync(
    join(process.cwd(), "src/mocks/meeting-transcripts.json"),
    "utf8",
  );
  const byId = (JSON.parse(raw) as { transcripts: Record<string, Transcript> })
    .transcripts;
  const entries = Object.entries(byId);
  const found = wanted
    ? entries.find(([id]) => id === wanted)
    : entries.find(([, t]) =>
        (t.lines ?? []).some((l) => (l.text ?? "").includes("803")),
      );

  if (!found) {
    console.error("대상 대화기록을 찾지 못했습니다.");
    process.exit(1);
  }

  const [meetingId, target] = found;
  const lines = target.lines.map((l) => l.text ?? "");
  console.log(`회의 ${meetingId}, ${lines.length}줄`);

  const started = Date.now();
  const { suggestions, usage } = await suggestTermCorrections(lines);
  console.log(
    `추천 ${suggestions.length}건, ${((Date.now() - started) / 1000).toFixed(1)}초, ` +
      `$${usage.estimatedUsd.toFixed(5)} (in ${usage.inputTokens} / out ${usage.outputTokens})\n`,
  );

  for (const s of suggestions) {
    console.log(
      `줄 ${s.lineIndex}: ${s.wrong} -> ${s.suggestion}  (유사도 ${s.similarity.toFixed(2)}) ${s.reason}`,
    );
    console.log(`   원문: ${lines[s.lineIndex]}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
