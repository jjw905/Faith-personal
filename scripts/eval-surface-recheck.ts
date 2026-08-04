import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { transcribeAudioOnce } from "../src/lib/stt/chunked-transcribe";
import { requireAudioToolPath } from "../src/lib/stt/local-tools";
import type { SttModel } from "../src/lib/stt/models";
import { estimateSttUsdFromMinutes } from "../src/lib/stt/pricing";

const ROOT = process.cwd();
const DATASET = join(
  ROOT,
  "Faith-office/08_검증_정답셋/Faith_브리핑_클로바_정답셋_2026-08-03/05_영상자료",
);
const OUT = join(ROOT, ".data/stt-bench/surface-recheck");
const CACHE = join(OUT, "20260804-targeted-recheck.json");

const CASES = [
  {
    id: "hearing-kim-huijeong",
    media: join(
      DATASET,
      "02_국회청문회/검증클립/김민석_인사청문회_00h41m45s-01h01m45s/02_김민석_인사청문회_00h41m45s-01h01m45s.mp4",
    ),
    startSec: 22,
    endSec: 31,
    expected: "김희정",
    glossary: ["김희정"],
  },
  {
    id: "brief-msit",
    media: join(
      DATASET,
      "01_공공브리핑/검증클립/범정부_정보보호_종합대책_2025-10-22/01_범정부_정보보호_종합대책_00h00m00s-00h18m16s.mp4",
    ),
    startSec: 337,
    endSec: 345,
    expected: "과기정통부",
    glossary: ["과기정통부"],
  },
  {
    id: "brief-boundary",
    media: join(
      DATASET,
      "01_공공브리핑/검증클립/범정부_정보보호_종합대책_2025-10-22/01_범정부_정보보호_종합대책_00h00m00s-00h18m16s.mp4",
    ),
    startSec: 294,
    endSec: 304,
    expected: "마지막으로",
    glossary: [] as string[],
  },
] as const;

const MODELS: SttModel[] = ["gpt-transcribe", "gpt-4o-transcribe"];

function flag(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function extractClip(
  media: string,
  startSec: number,
  endSec: number,
  output: string,
) {
  execFileSync(
    requireAudioToolPath("ffmpeg"),
    [
      "-y",
      "-v",
      "error",
      "-ss",
      String(startSec),
      "-i",
      media,
      "-t",
      String(endSec - startSec),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      output,
    ],
    { timeout: 60_000, killSignal: "SIGKILL" },
  );
}

async function main() {
  const fresh = process.argv.includes("--fresh");
  if (!fresh) {
    if (!existsSync(CACHE)) {
      throw new Error("캐시가 없습니다. --fresh와 --budget-usd를 명시하세요.");
    }
    console.log(readFileSync(CACHE, "utf8"));
    return;
  }
  const budgetUsd = Number(flag("budget-usd"));
  const preflightUsd = CASES.reduce(
    (sum, fixture) =>
      sum +
      MODELS.reduce(
        (modelSum, model) =>
          modelSum +
          estimateSttUsdFromMinutes(model, fixture.endSec - fixture.startSec) *
            (fixture.glossary.length > 0 ? 2 : 1),
        0,
      ),
    0,
  );
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    throw new Error(
      `예상 $${preflightUsd.toFixed(4)}. --budget-usd가 필요합니다.`,
    );
  }
  if (preflightUsd > budgetUsd) {
    throw new Error(
      `예상 $${preflightUsd.toFixed(4)}가 예산 $${budgetUsd.toFixed(4)}를 넘습니다.`,
    );
  }
  console.error(
    `[budget] targeted surface recheck <=$${preflightUsd.toFixed(4)} / $${budgetUsd.toFixed(4)}`,
  );

  mkdirSync(OUT, { recursive: true });
  const rows: Array<Record<string, unknown>> = [];
  for (const fixture of CASES) {
    const clip = join(OUT, `${fixture.id}.mp3`);
    extractClip(fixture.media, fixture.startSec, fixture.endSec, clip);
    try {
      for (const model of MODELS) {
        const variants =
          fixture.glossary.length > 0
            ? [
                { label: "none", glossary: [] as string[] },
                { label: "grounded", glossary: [...fixture.glossary] },
              ]
            : [{ label: "none", glossary: [] as string[] }];
        for (const variant of variants) {
          const result = await transcribeAudioOnce({
            audioBytes: readFileSync(clip),
            filename: `${fixture.id}.mp3`,
            model,
            glossary: variant.glossary,
          });
          rows.push({
            fixture: fixture.id,
            model,
            variant: variant.label,
            expected: fixture.expected,
            hit: result.text.includes(fixture.expected),
            text: result.text,
            usage: result.usage,
            estimatedUsd: estimateSttUsdFromMinutes(
              model,
              fixture.endSec - fixture.startSec,
            ),
          });
        }
      }
    } finally {
      rmSync(clip, { force: true });
    }
  }
  const output = {
    generatedAt: new Date().toISOString(),
    preflightUsd,
    rows,
  };
  writeFileSync(CACHE, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(output, null, 2));
}

void main();
