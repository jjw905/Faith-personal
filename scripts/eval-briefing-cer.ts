/**
 * 정책브리핑 음성으로 CER을 잰다.
 *
 * 국회 속기록은 군말을 걷어낸 정리본이라 정답으로 쓰기에 나쁘다. 브리핑
 * 전문은 기자 질의응답까지 말한 대로 적혀 있어 훨씬 정직한 자다.
 *
 * 전사 결과는 파일로 남겨 두고 다음 실행에서 다시 쓴다. 같은 음성을 여러 번
 * 올리면 돈만 나간다. 다시 받으려면 --fresh 를 준다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-briefing-cer.ts brief-envwork
 */
import { config } from "dotenv";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

config({ path: ".env.local" });
config();

import { chunkedTranscribe } from "../src/lib/stt/chunked-transcribe";
import { alignedCer, normalize } from "./lib/cer";

const DIR = ".data/stt-bench/fixtures";
const MODEL = "gpt-4o-mini-transcribe";
/** 화자 머리표와 안 들린 자리 표시는 발화가 아니다. */
const ROLE_TAG = /^\[[^\]]{1,6}\]\s*/;
const INAUDIBLE = /\*{2,}/;

/**
 * 브리핑 전문을 만드는 사람은 말버릇을 지우고 올린다.
 *
 * 말하는 이가 분명히 "이제"라고 했는데 전문에는 없다. 그걸 그대로 채점하면
 * 들은 대로 적은 모델이 오히려 깎인다. 양쪽에서 똑같이 걷어내고 다시 재서,
 * 편집 때문에 생긴 차이와 진짜 잘못 들은 것을 갈라 본다.
 */
const FILLERS = new Set(["이제", "인제", "어", "음", "아", "에"]);

function dropFillers(text: string): string {
  return text
    .split(/\s+/)
    .filter((w) => !FILLERS.has(w.replace(/[,.]/g, "")))
    .join(" ");
}

function refParagraphs(alias: string, stripFillers: boolean): string[] {
  const raw = readFileSync(join(DIR, `${alias}.reference.txt`), "utf8");
  return raw
    .split("\n")
    .map((line) => line.replace(ROLE_TAG, ""))
    // 마이크를 안 써서 안 들린 대목은 애초에 받아적을 수 없다. 채점에서 뺀다.
    .filter((line) => !INAUDIBLE.test(line))
    .map((line) => normalize(stripFillers ? dropFillers(line) : line))
    .filter((p) => p.length >= 25);
}

async function transcript(alias: string, fresh: boolean): Promise<string> {
  const cache = join(DIR, `${alias}.hypothesis.txt`);
  if (!fresh && existsSync(cache)) return readFileSync(cache, "utf8");

  const out = await chunkedTranscribe({
    audioPath: join(DIR, `${alias}.mp3`),
    workDir: mkdtempSync(join(tmpdir(), `${alias}-`)),
    model: MODEL,
  });
  writeFileSync(cache, out.text, "utf8");
  return out.text;
}

async function measure(alias: string, fresh: boolean) {
  const meta = JSON.parse(
    readFileSync(join(DIR, `${alias}.meta.json`), "utf8"),
  ) as { title: string; durationSec: number; questions: number };

  const raw = await transcript(alias, fresh);
  const strict = alignedCer(refParagraphs(alias, false), normalize(raw));
  const lenient = alignedCer(
    refParagraphs(alias, true),
    normalize(dropFillers(raw)),
  );
  return { alias, meta, strict, lenient };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const aliases = args.length ? args : ["brief-envwork"];
  const fresh = process.argv.includes("--fresh");

  const results = [];
  for (const alias of aliases) results.push(await measure(alias, fresh));

  console.log("\n브리핑                        분   대조자수   CER   말버릇 제외");
  console.log("─".repeat(66));
  for (const r of results) {
    const name = r.meta.title.slice(0, 22).padEnd(24);
    const min = String(Math.round(r.meta.durationSec / 60)).padStart(3);
    const chars = String(r.strict.refChars).padStart(8);
    const cer = `${(r.strict.cer * 100).toFixed(1)}%`.padStart(7);
    const soft = `${(r.lenient.cer * 100).toFixed(1)}%`.padStart(9);
    console.log(`${name}${min}${chars}${cer}${soft}`);
  }

  const total = results.reduce((s, r) => s + r.strict.refChars, 0);
  const wAvg = (pick: (r: (typeof results)[0]) => number) =>
    results.reduce((s, r) => s + pick(r) * r.strict.refChars, 0) / total;
  console.log("─".repeat(66));
  console.log(
    `${"가중 평균".padEnd(24)}${"".padStart(3)}${String(total).padStart(8)}` +
      `${`${(wAvg((r) => r.strict.cer) * 100).toFixed(1)}%`.padStart(7)}` +
      `${`${(wAvg((r) => r.lenient.cer) * 100).toFixed(1)}%`.padStart(9)}`,
  );

  if (!process.argv.includes("--detail")) return;
  for (const r of results) {
    console.log(`\n[${r.meta.title}] 가장 많이 틀린 대목`);
    for (const w of r.strict.worst.slice(0, 3)) {
      console.log(`  ${((w.dist / w.len) * 100).toFixed(0)}% 정답: ${w.ref}`);
      console.log(`      전사: ${w.hyp}`);
    }
  }
}

void main();
