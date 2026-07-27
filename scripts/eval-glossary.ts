/**
 * 용어를 미리 알려 주면 고유명사를 제대로 받는지 잰다.
 *
 * 켜기 전후를 같은 오디오로 돌려 CER과 고유명사 적중을 비교한다.
 * 같이 봐야 하는 것은 환각이다. 사전에 있는 말을 하지도 않은 자리에
 * 끼워 넣으면 CER은 좋아 보여도 글은 나빠진다. 넣지 않은 말이
 * 몇 번 튀어나오는지도 센다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-glossary.ts
 */
import { config } from "dotenv";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

config({ path: ".env.local" });
config();

import { chunkedTranscribe } from "../src/lib/stt/chunked-transcribe";

const CLIP = ".data/stt-bench/fixtures/assembly3-dense-180.wav";
const REFERENCE = ".data/stt-bench/fixtures/assembly3-dense-180.reference.txt";

/** 이 회의 참석자와 지명. 실제로는 참석자 목록과 보정 이력에서 나온다. */
const GLOSSARY = [
  "팔공산",
  "안호영",
  "임이자",
  "금한승",
  "정혜경",
  "우재준",
  "생태탐방원",
  "국립공원",
  "환경노동위원회",
  "추가경정예산안",
];

/** 사전에는 있지만 이 구간에서 실제로 나오지 않는 말. 끼워 넣으면 환각이다. */
const NOT_SPOKEN = ["안호영", "정혜경", "환경노동위원회"];

function norm(t: string): string {
  return t.toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(
        Math.min(
          cur[j - 1]! + 1,
          prev[j]! + 1,
          prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

function count(hay: string, needle: string): number {
  return hay.split(needle).length - 1;
}

async function run(label: string, glossary?: string[]) {
  const out = await chunkedTranscribe({
    audioPath: CLIP,
    workDir: mkdtempSync(join(tmpdir(), "gloss-")),
    model: "gpt-4o-mini-transcribe",
    glossary,
  });
  const ref = norm(readFileSync(REFERENCE, "utf8"));
  const hyp = norm(out.text);
  const cer = editDistance(ref, hyp) / ref.length;

  const ghosts = NOT_SPOKEN.map((t) => [t, count(out.text, t)] as const).filter(
    ([, n]) => n > 0,
  );

  console.log(`\n[${label}]`);
  console.log(`  CER ${(cer * 100).toFixed(1)}%  글자 ${hyp.length}`);
  console.log(
    `  팔공산 ${count(out.text, "팔공산")}회 / 803 ${count(out.text, "803")}회`,
  );
  console.log(
    `  안 한 말 끼워넣기: ${ghosts.length ? ghosts.map(([t, n]) => `${t}×${n}`).join(", ") : "없음"}`,
  );
  return out.text;
}

async function main() {
  // 프롬프트를 어떻게 쓰느냐로 결과가 갈린다. 형식을 바꿔 가며 잰다.
  for (let rep = 0; rep < 2; rep++) {
    console.log(`\n===== ${rep + 1}회차 =====`);
    await run("용어 없이");
    await run("용어 주입", GLOSSARY);
  }
}

void main();
