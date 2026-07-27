/**
 * 화자 실명 추정 점검. 대화기록만 주고 라벨이 누구인지 맞히는지 본다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/check-speaker-names.ts [meetingId]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";

import { identifySpeakerNames } from "../src/lib/stt/speaker-names";

config({ path: ".env.local" });
config();

type Line = { speaker?: string; text?: string };

async function main() {
  const wanted = process.argv[2] ?? "mtg-cmp-mini";
  const raw = readFileSync(
    join(process.cwd(), "src/mocks/meeting-transcripts.json"),
    "utf8",
  );
  const map = (JSON.parse(raw) as { transcripts: Record<string, { lines: Line[] }> })
    .transcripts;
  const target = map[wanted];
  if (!target) {
    console.error(`${wanted} 대화기록이 없습니다.`);
    process.exit(1);
  }

  const dialogue = target.lines.map((l) => ({
    speaker: l.speaker,
    text: l.text ?? "",
  }));

  const started = Date.now();
  const { guesses, usage } = await identifySpeakerNames({ dialogue });
  console.log(
    `${wanted}: ${dialogue.length}줄, ${((Date.now() - started) / 1000).toFixed(1)}초, ` +
      `$${usage.estimatedUsd.toFixed(5)}\n`,
  );
  if (guesses.length === 0) {
    console.log("확신이 낮아 라벨을 유지합니다.");
  }
  for (const g of guesses) {
    console.log(
      `${g.label} -> ${g.name} (확신 ${g.confidence.toFixed(2)}) ${g.evidence}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
