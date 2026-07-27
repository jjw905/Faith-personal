/**
 * 모델이 스스로 잘못 받은 고유명사를 의심할 수 있는지 본다.
 *
 * 사전도 정답지도 주지 않는다. 전사 본문만 주고, 이상한 자리를 짚고
 * 무엇이었을지 말하게 한다. 이게 되면 지난 기록 없이도 스스로 사전을
 * 만들 수 있고, 안 되면 사람이 넣어 주는 수밖에 없다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/check-self-suspect.ts
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";

config({ path: ".env.local" });
config();

import { suggestTermCorrections } from "../src/lib/stt/term-suggest";

const CASES = [
  {
    label: "국회 3분 구간 (803 = 팔공산)",
    file: ".data/stt-bench/multi-speaker-run-20260727/upload__gpt-4o-mini-transcribe.txt",
    expect: ["팔공산"],
  },
  {
    label: "국회 18분 전체 (용어 없이)",
    file: ".data/stt-bench/assembly__gpt-4o-mini-transcribe__chunked-silencecut.txt",
    expect: ["임의자", "안호영"],
  },
];

async function main() {
  for (const c of CASES) {
    const text = readFileSync(c.file, "utf8");
    const lines = text
      .split(/\n+/)
      .flatMap((l) => l.split(/(?<=[.!?])\s+/))
      .map((l) => l.trim())
      .filter(Boolean);

    const r = await suggestTermCorrections(lines);
    console.log(`\n[${c.label}]  줄 ${lines.length}, 추천 ${r.suggestions.length}건`);
    for (const s of r.suggestions) {
      console.log(`  ${s.wrong} → ${s.suggestion}   ${s.reason ?? ""}`);
    }
    for (const want of c.expect) {
      const hit = r.suggestions.some((s) => s.suggestion.includes(want));
      console.log(`  기대한 ${want}: ${hit ? "짚음" : "못 짚음"}`);
    }
    console.log(`  비용 $${r.usage.estimatedUsd.toFixed(4)}`);
  }
}

void main();
