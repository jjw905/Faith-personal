/**
 * 공공누리 정책브리핑 약 60분 고정 평가.
 *
 * 개발 30분과 봉인 29.5분을 분리한다. 전사는 정답 파일을 읽기 전에 끝낸다.
 * 봉인 재호출은 --fresh --split=sealed --confirm-sealed를 모두 줘야 한다.
 *
 * 캐시 평가:
 * npx tsx --tsconfig tsconfig.json scripts/eval-stt-public-60.ts
 *
 * 추천 평가:
 * npx tsx --tsconfig tsconfig.json scripts/eval-stt-public-60.ts --suggestions
 */
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync } from "node:fs";

import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { buildGlossary } from "../src/lib/stt/glossary";
import { chunkedTranscribe } from "../src/lib/stt/chunked-transcribe";
import { suggestTermCorrections } from "../src/lib/stt/term-suggest";
import { alignedCer, normalize } from "./lib/cer";
import { judgeChange, type Verdict } from "./lib/change-verdict";

const ROOT = process.cwd();
const FIXTURE_DIR = join(ROOT, ".data/stt-bench/fixtures");
const OUT_DIR = join(ROOT, ".data/stt-bench/public-60");
const REPORT_DIR = join(ROOT, "Faith-office/stt-term-runs/reports");
const REPORT_PATH = join(
  REPORT_DIR,
  "Faith_STT_공공영상60분_평가.md",
);
const MODEL = "gpt-4o-mini-transcribe" as const;
const ROLE_TAG = /^\[[^\]]{1,6}\]\s*/;
const INAUDIBLE = /\*{2,}/;
const USD_PER_MINUTE_MAX = 0.006;
const USD_TO_KRW = 1_400;
const TARGET_KRW_PER_MINUTE = 12;

const FIXTURES = [
  { alias: "brief-envwork", split: "dev" as const },
  { alias: "brief-moe", split: "dev" as const },
  { alias: "brief-mofa", split: "sealed" as const },
  { alias: "brief-mohw", split: "sealed" as const },
] as const;

type FixtureMeta = {
  title: string;
  sourceUrl: string;
  videoUrl: string;
  license: string;
  durationSec: number;
  questions: number;
  inaudibleMarks: number;
};

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function fixturePaths(alias: string) {
  return {
    audio: join(FIXTURE_DIR, `${alias}.mp3`),
    reference: join(FIXTURE_DIR, `${alias}.reference.txt`),
    meta: join(FIXTURE_DIR, `${alias}.meta.json`),
    priorHypothesis: join(FIXTURE_DIR, `${alias}.hypothesis.txt`),
    hypothesis: join(OUT_DIR, "hypotheses", `${alias}.txt`),
    usage: join(OUT_DIR, "hypotheses", `${alias}.usage.json`),
  };
}

function textSha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function cachedEstimatedUsd(alias: string, text: string): number {
  const paths = fixturePaths(alias);
  if (existsSync(paths.usage)) {
    try {
      const usage = JSON.parse(readFileSync(paths.usage, "utf8")) as {
        hypothesisSha256?: string;
        estimatedUsd?: number;
      };
      if (
        usage.hypothesisSha256 === textSha256(text) &&
        Number.isFinite(usage.estimatedUsd)
      ) {
        return Math.max(0, Number(usage.estimatedUsd));
      }
    } catch {
      // 깨진 부속 파일은 이전 실행 결과로 복구한다.
    }
  }

  for (const resultSplit of ["dev", "sealed"] as const) {
    const resultPath = join(OUT_DIR, `result-${resultSplit}.json`);
    if (!existsSync(resultPath)) continue;
    try {
      const prior = JSON.parse(readFileSync(resultPath, "utf8")) as {
        results?: Array<{
          alias?: string;
          fromCache?: boolean;
          estimatedUsd?: number;
        }>;
      };
      const row = prior.results?.find(
        (candidate) => candidate.alias === alias && candidate.fromCache === false,
      );
      if (row && Number.isFinite(row.estimatedUsd)) {
        return Math.max(0, Number(row.estimatedUsd));
      }
    } catch {
      // 과거 결과가 없으면 비용 0으로 두되 품질 평가는 계속한다.
    }
  }
  return 0;
}

function loadMeta(alias: string): FixtureMeta {
  const path = fixturePaths(alias).meta;
  const meta = JSON.parse(readFileSync(path, "utf8")) as FixtureMeta;
  if (!meta.license.startsWith("공공누리 제1유형")) {
    throw new Error(`${alias}: 공공누리 제1유형이 아닙니다.`);
  }
  return meta;
}

function referenceParagraphs(path: string): string[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.replace(ROLE_TAG, ""))
    .filter((line) => !INAUDIBLE.test(line))
    .map(normalize)
    .filter((line) => line.length >= 25);
}

async function hypothesis(params: {
  alias: string;
  fresh: boolean;
}): Promise<{ text: string; estimatedUsd: number; fromCache: boolean }> {
  const paths = fixturePaths(params.alias);
  if (!params.fresh) {
    const cache = existsSync(paths.hypothesis)
      ? paths.hypothesis
      : paths.priorHypothesis;
    if (!existsSync(cache)) {
      throw new Error(`${params.alias}: 전사 캐시가 없습니다. --fresh가 필요합니다.`);
    }
    const text = readFileSync(cache, "utf8");
    return {
      text,
      estimatedUsd: cachedEstimatedUsd(params.alias, text),
      fromCache: true,
    };
  }

  const out = await chunkedTranscribe({
    audioPath: paths.audio,
    workDir: mkdtempSync(join(tmpdir(), `${params.alias}-public-60-`)),
    model: MODEL,
  });
  mkdirSync(join(OUT_DIR, "hypotheses"), { recursive: true });
  writeFileSync(paths.hypothesis, out.text, "utf8");
  writeFileSync(
    paths.usage,
    JSON.stringify(
      {
        hypothesisSha256: textSha256(out.text),
        estimatedUsd: out.usage.estimatedUsd,
      },
      null,
      2,
    ),
    "utf8",
  );
  return {
    text: out.text,
    estimatedUsd: out.usage.estimatedUsd,
    fromCache: false,
  };
}

function applySuggestions(
  text: string,
  suggestions: Array<{ wrong: string; suggestion: string }>,
): string {
  const edits: Array<{ start: number; end: number; value: string }> = [];
  const used = new Set<number>();
  for (const suggestion of suggestions) {
    let start = text.indexOf(suggestion.wrong);
    while (start >= 0 && used.has(start)) {
      start = text.indexOf(suggestion.wrong, start + suggestion.wrong.length);
    }
    if (start < 0) continue;
    used.add(start);
    edits.push({
      start,
      end: start + suggestion.wrong.length,
      value: suggestion.suggestion,
    });
  }
  let out = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.value + out.slice(edit.end);
  }
  return out;
}

function suggestionVerdicts(
  text: string,
  reference: string,
  suggestions: Array<{ wrong: string; suggestion: string }>,
) {
  const counts: Record<Verdict, number> = {
    improved: 0,
    worsened: 0,
    tied: 0,
    unmatched: 0,
  };
  const cursor = new Map<string, number>();
  for (const suggestion of suggestions) {
    const from = cursor.get(suggestion.wrong) ?? 0;
    const start = text.indexOf(suggestion.wrong, from);
    if (start < 0) {
      counts.unmatched += 1;
      continue;
    }
    cursor.set(suggestion.wrong, start + suggestion.wrong.length);
    const judged = judgeChange({
      hypothesis: text,
      start,
      end: start + suggestion.wrong.length,
      replacement: suggestion.suggestion,
      reference,
    });
    counts[judged.verdict] += 1;
  }
  return counts;
}

async function main() {
  const splitArg = process.argv.find((arg) => arg.startsWith("--split="));
  const split = splitArg?.split("=")[1] ?? "all";
  if (!["all", "dev", "sealed"].includes(split)) {
    throw new Error("--split은 all, dev, sealed 중 하나여야 합니다.");
  }
  const fresh = process.argv.includes("--fresh");
  const suggestionsEnabled = process.argv.includes("--suggestions");
  if (
    fresh &&
    (split === "sealed" || split === "all") &&
    !process.argv.includes("--confirm-sealed")
  ) {
    throw new Error(
      "봉인셋 재호출에는 --confirm-sealed가 필요합니다. 개발 중에는 --split=dev를 사용하세요.",
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });
  const selected = FIXTURES.filter(
    (fixture) => split === "all" || fixture.split === split,
  );
  const manifest = FIXTURES.map((fixture) => {
    const paths = fixturePaths(fixture.alias);
    const meta = loadMeta(fixture.alias);
    for (const path of [paths.audio, paths.reference, paths.meta]) {
      if (!existsSync(path)) throw new Error(`고정 파일 없음: ${path}`);
    }
    return {
      ...fixture,
      title: meta.title,
      durationSec: meta.durationSec,
      sourceUrl: meta.sourceUrl,
      videoUrl: meta.videoUrl,
      license: meta.license,
      questions: meta.questions,
      inaudibleMarks: meta.inaudibleMarks,
      checksums: {
        audioSha256: sha256(paths.audio),
        referenceSha256: sha256(paths.reference),
        metaSha256: sha256(paths.meta),
      },
    };
  });
  writeFileSync(
    join(OUT_DIR, "manifest.json"),
    JSON.stringify(
      {
        version: 1,
        model: MODEL,
        totalDurationSec: manifest.reduce(
          (sum, row) => sum + row.durationSec,
          0,
        ),
        contaminationRule:
          "전사와 추천 생성이 끝난 뒤에만 정답 파일을 읽는다. 추천 입력은 제목과 가설 전사뿐이다.",
        fixtures: manifest,
      },
      null,
      2,
    ),
  );

  const maxFreshUsd =
    selected.reduce((sum, fixture) => {
      const meta = loadMeta(fixture.alias);
      return sum + (meta.durationSec / 60) * USD_PER_MINUTE_MAX;
    }, 0);
  const budgetUsd = Number(process.env.STT_EVAL_BUDGET_USD ?? "1");
  if (fresh && (!Number.isFinite(budgetUsd) || maxFreshUsd > budgetUsd)) {
    throw new Error(
      `예상 최대 $${maxFreshUsd.toFixed(3)}가 평가 예산 $${budgetUsd.toFixed(3)}를 넘습니다.`,
    );
  }

  const results = [];
  for (const fixture of selected) {
    const meta = loadMeta(fixture.alias);
    const transcript = await hypothesis({
      alias: fixture.alias,
      fresh,
    });

    // 오염 방지 경계: 모델 출력과 추천 생성 전에는 정답을 읽지 않는다.
    const suggested = suggestionsEnabled
      ? await suggestTermCorrections(transcript.text.split("\n"), {
          glossary: await buildGlossary({ title: meta.title }),
        })
      : null;
    const referencePath = fixturePaths(fixture.alias).reference;
    const reference = readFileSync(referencePath, "utf8");
    const paragraphs = referenceParagraphs(referencePath);
    const before = alignedCer(paragraphs, normalize(transcript.text));
    const hypothetical = suggested
      ? applySuggestions(transcript.text, suggested.suggestions)
      : transcript.text;
    const after = alignedCer(paragraphs, normalize(hypothetical));
    const verdicts = suggested
      ? suggestionVerdicts(
          transcript.text,
          reference,
          suggested.suggestions,
        )
      : { improved: 0, worsened: 0, tied: 0, unmatched: 0 };
    const matched = verdicts.improved + verdicts.worsened + verdicts.tied;
    results.push({
      alias: fixture.alias,
      split: fixture.split,
      title: meta.title,
      durationSec: meta.durationSec,
      fromCache: transcript.fromCache,
      estimatedUsd: transcript.estimatedUsd,
      cer: before.cer,
      hypotheticalSuggestionCer: after.cer,
      suggestionCount: suggested?.suggestions.length ?? 0,
      suggestionPrecision:
        matched > 0 ? verdicts.improved / matched : null,
      verdicts,
      dictionaryUsage: suggested?.usage ?? null,
    });
  }

  const totalRefChars = results.reduce(
    (sum, result) =>
      sum +
      alignedCer(
        referenceParagraphs(fixturePaths(result.alias).reference),
        normalize(
          readFileSync(
            existsSync(fixturePaths(result.alias).hypothesis)
              ? fixturePaths(result.alias).hypothesis
              : fixturePaths(result.alias).priorHypothesis,
            "utf8",
          ),
        ),
      ).refChars,
    0,
  );
  const weightedCer =
    results.reduce((sum, result) => {
      const refChars = alignedCer(
        referenceParagraphs(fixturePaths(result.alias).reference),
        normalize(
          readFileSync(
            existsSync(fixturePaths(result.alias).hypothesis)
              ? fixturePaths(result.alias).hypothesis
              : fixturePaths(result.alias).priorHypothesis,
            "utf8",
          ),
        ),
      ).refChars;
      return sum + result.cer * refChars;
    }, 0) / Math.max(1, totalRefChars);
  const payload = {
    generatedAt: new Date().toISOString(),
    model: MODEL,
    split,
    fresh,
    suggestionsEnabled,
    selectedDurationSec: selected.reduce(
      (sum, fixture) => sum + loadMeta(fixture.alias).durationSec,
      0,
    ),
    estimatedUsd: results.reduce(
      (sum, result) => sum + result.estimatedUsd,
      0,
    ),
    weightedCer,
    results,
  };
  const evaluatedMinutes = payload.selectedDurationSec / 60;
  const estimatedKrwPerMinute =
    evaluatedMinutes > 0
      ? (payload.estimatedUsd * USD_TO_KRW) / evaluatedMinutes
      : 0;
  writeFileSync(
    join(OUT_DIR, `result-${split}.json`),
    JSON.stringify(payload, null, 2),
  );

  const report = [
    "# Faith STT 공공영상 60분 평가",
    `- 날짜: ${payload.generatedAt.slice(0, 10)}`,
    `- 모델: ${MODEL}`,
    `- 평가 길이: ${(payload.selectedDurationSec / 60).toFixed(1)}분`,
    `- 가중 CER: ${(weightedCer * 100).toFixed(2)}%`,
    `- STT, 타이밍 API 비용: $${payload.estimatedUsd.toFixed(4)}`,
    `- 분당 비용: 약 ${estimatedKrwPerMinute.toFixed(1)}원`,
    `- 분당 ${TARGET_KRW_PER_MINUTE}원 기준: ${estimatedKrwPerMinute <= TARGET_KRW_PER_MINUTE ? "통과" : "실패"}`,
    "- 평가셋: 정책브리핑 발표와 기자 질의응답, 공공누리 제1유형 본문",
    "- 정답 오염 방지: 전사와 추천 생성 후 정답 로드",
    "",
    "## 결과",
    ...results.flatMap((result) => [
      `- ${result.alias}, ${result.split}, ${(result.durationSec / 60).toFixed(1)}분`,
      `  - CER: ${(result.cer * 100).toFixed(2)}%`,
      `  - 추천: ${result.suggestionCount}건`,
      `  - 추천 정밀도: ${
        result.suggestionPrecision == null
          ? "측정 없음"
          : `${(result.suggestionPrecision * 100).toFixed(1)}%`
      }`,
      `  - 우리말샘 호출: ${result.dictionaryUsage?.apiCalls ?? 0}건`,
    ]),
  ].join("\n");
  writeFileSync(REPORT_PATH, report, "utf8");

  console.log(JSON.stringify(payload, null, 2));
  console.log(`보고서: ${REPORT_PATH}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
