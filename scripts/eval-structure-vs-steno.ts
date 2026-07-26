/**
 * 사이트와 동일: STT 원문 → gpt-4o-mini 구조화 → 속기 기준 CER 비교
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-structure-vs-steno.ts
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const ROOT = process.cwd();
const RUN = join(ROOT, ".data/stt-bench/multi-speaker-run-20260727");
const REF = join(
  ROOT,
  ".data/stt-bench/fixtures/assembly3-dense-180.reference.txt",
);
const STT = join(RUN, "upload__gpt-4o-mini-transcribe.txt");

const KEY_TERMS = [
  "금한승",
  "팔공산",
  "생태탐방원",
  "우재준",
  "국립환경과학원",
  "추가경정",
  "본예산",
];

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, "");
}

function editDistance(left: string, right: string): number {
  const prev = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 0; i < left.length; i += 1) {
    const cur = [i + 1];
    for (let j = 0; j < right.length; j += 1) {
      cur.push(
        Math.min(
          cur[j]! + 1,
          prev[j + 1]! + 1,
          prev[j]! + Number(left[i] !== right[j]),
        ),
      );
    }
    for (let j = 0; j < prev.length; j += 1) prev[j] = cur[j]!;
  }
  return prev[right.length]!;
}

function score(hypothesis: string, reference: string) {
  const h = normalize(hypothesis);
  const r = normalize(reference);
  const distance = editDistance(h, r);
  return {
    referenceChars: r.length,
    hypothesisChars: h.length,
    lengthRatio: Number((h.length / Math.max(1, r.length)).toFixed(4)),
    editDistance: distance,
    cer: Number((distance / Math.max(1, r.length)).toFixed(4)),
  };
}

function termHits(text: string) {
  return KEY_TERMS.map((term) => ({
    term,
    count: (text.match(new RegExp(term, "g")) || []).length,
    present: text.includes(term),
  }));
}

async function main() {
  const reference = readFileSync(REF, "utf8");
  const sttText = readFileSync(STT, "utf8");
  const { buildSemanticStructure } = await import(
    "../src/lib/stt/semantic-structure"
  );

  console.log("structuring with gpt-4o-mini…");
  const { structure, usage } = await buildSemanticStructure(sttText, 180);
  const dialogueText = structure.dialogue.map((d) => d.text).join("\n");

  const report = {
    createdAt: new Date().toISOString(),
    fixtureId: "assembly3-dense-180",
    pipeline: [
      "gpt-4o-mini-transcribe (기존 벤치 원문)",
      "gpt-4o-mini structure (사이트와 동일)",
    ],
    usage,
    metrics: {
      rawStt: score(sttText, reference),
      structuredDialogue: score(dialogueText, reference),
      overallSummary: score(structure.overallSummary, reference),
    },
    keyTerms: {
      reference: termHits(reference),
      rawStt: termHits(sttText),
      structuredDialogue: termHits(dialogueText),
    },
    samples: {
      rawSttHead: sttText.slice(0, 220),
      dialogueHead: dialogueText.slice(0, 400),
      overallSummary: structure.overallSummary,
      dialogueLineCount: structure.dialogue.length,
      keywords: structure.keywords,
    },
    dialogue: structure.dialogue,
  };

  mkdirSync(RUN, { recursive: true });
  const out = join(RUN, "structure-vs-steno.json");
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(RUN, "structure-dialogue.txt"), `${dialogueText}\n`);
  console.log(JSON.stringify({
    metrics: report.metrics,
    keyTerms: report.keyTerms,
    usage: report.usage,
    out,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
