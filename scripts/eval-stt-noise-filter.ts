/**
 * 개발셋에서만 ffmpeg 경량 잡음 억제를 비교한다.
 * 봉인셋에는 이 결과로 필터를 조정하지 않는다.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { chunkedTranscribe } from "../src/lib/stt/chunked-transcribe";
import { requireAudioToolPath } from "../src/lib/stt/local-tools";
import { alignedCer, normalize } from "./lib/cer";

const ROOT = process.cwd();
const FIXTURES = ["brief-envwork", "brief-moe"] as const;
const FILTERS = {
  light: "highpass=f=70,lowpass=f=10000,afftdn=nr=8:nf=-35:tn=1",
  speech: "highpass=f=80,lowpass=f=9000,afftdn=nr=12:nf=-30:tn=1",
} as const;
const filterName = (process.env.FILTER ?? "light") as keyof typeof FILTERS;
const filter = FILTERS[filterName];
if (!filter) throw new Error("FILTER는 light 또는 speech여야 합니다.");

const ROLE_TAG = /^\[[^\]]{1,6}\]\s*/;
const INAUDIBLE = /\*{2,}/;

function referenceParagraphs(alias: string) {
  return readFileSync(
    join(ROOT, `.data/stt-bench/fixtures/${alias}.reference.txt`),
    "utf8",
  )
    .split("\n")
    .map((line) => line.replace(ROLE_TAG, ""))
    .filter((line) => !INAUDIBLE.test(line))
    .map(normalize)
    .filter((line) => line.length >= 25);
}

async function main() {
  const outDir = join(ROOT, `.data/stt-bench/noise-filter/${filterName}`);
  mkdirSync(outDir, { recursive: true });
  const results = [];

  for (const alias of FIXTURES) {
    const source = join(
      ROOT,
      `.data/stt-bench/fixtures/${alias}.mp3`,
    );
    const filtered = join(outDir, `${alias}.mp3`);
    execFileSync(
      requireAudioToolPath("ffmpeg"),
      [
        "-y",
        "-i",
        source,
        "-af",
        filter,
        "-ac",
        "1",
        "-ar",
        "24000",
        "-c:a",
        "libmp3lame",
        "-b:a",
        "64k",
        filtered,
      ],
      { stdio: "pipe" },
    );
    const result = await chunkedTranscribe({
      audioPath: filtered,
      workDir: join(outDir, `work-${alias}`),
      model: "gpt-4o-mini-transcribe",
    });
    writeFileSync(join(outDir, `${alias}.hypothesis.txt`), result.text);
    const score = alignedCer(
      referenceParagraphs(alias),
      normalize(result.text),
    );
    results.push({
      alias,
      cer: score.cer,
      refChars: score.refChars,
      estimatedUsd: result.usage.estimatedUsd,
    });
  }

  const refChars = results.reduce((sum, row) => sum + row.refChars, 0);
  const weightedCer =
    results.reduce((sum, row) => sum + row.cer * row.refChars, 0) /
    Math.max(1, refChars);
  const output = {
    filterName,
    filter,
    weightedCer,
    results,
  };
  writeFileSync(
    join(outDir, "summary.json"),
    JSON.stringify(output, null, 2),
  );
  console.log(JSON.stringify(output, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
