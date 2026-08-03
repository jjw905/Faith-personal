/** Four-fixture quality gate. Cache-only by default; --fresh spends API budget. */
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });
config();

import {
  chunkedTranscribe,
  type ChunkedTranscribeResult,
} from "../src/lib/stt/chunked-transcribe";
import { estimateSttUsdFromMinutes } from "../src/lib/stt/pricing";
import { MEDIA_OUTLET_TERMS } from "../src/lib/stt/media-outlets";
import { alignedCer, normalize } from "./lib/cer";

const ROOT = ".data/stt-bench";
const FIXTURES = join(ROOT, "fixtures");
const OUT = join(ROOT, "meeting-quality-gate");
const MODEL = "gpt-transcribe" as const;
const PRIOR_DOCUMENTED_USD = 0.02880015;
const DEFAULT_TOTAL_BUDGET_USD = 1;
const ROLE_TAG = /^\[[^\]]{1,12}\]\s*/;
const INAUDIBLE = /\*{2,}/;

type Fixture = {
  id: string;
  audio: string;
  reference: string;
  durationSec: number;
  properNouns: string[];
  kind: "brief" | "clova";
};

const FIXTURE_SPECS: Fixture[] = [
  {
    id: "brief-ailab",
    audio: join(FIXTURES, "brief-ailab.mp3"),
    reference: join(FIXTURES, "brief-ailab.reference.txt"),
    durationSec: 900,
    properNouns: ["조원갑", "행정안전부", "AI 정부 실험실", "AI 챔피언", "AX"],
    kind: "brief",
  },
  {
    id: "brief-startup",
    audio: join(FIXTURES, "brief-startup.mp3"),
    reference: join(FIXTURES, "brief-startup.reference.txt"),
    durationSec: 900,
    properNouns: [
      "노용석",
      "중소벤처기업부",
      "모두의 창업 플랫폼",
      "국가정보원",
      "개인정보보호위원회",
      "스타트업 원스톱지원센터",
    ],
    kind: "brief",
  },
  {
    id: "brief-mou",
    audio: join(FIXTURES, "brief-mou.mp3"),
    reference: join(FIXTURES, "brief-mou.reference.txt"),
    durationSec: 272.3,
    properNouns: [
      "통일부",
      "조선중앙통신",
      "주일미군사령부",
      "비무장지대",
      "9.19 군사합의",
      "왕이",
    ],
    kind: "brief",
  },
  {
    id: "ktv-briefing-20251231",
    audio: join(ROOT, "ktv-briefing-20251231.mp3"),
    reference: join(ROOT, "ktv__reference.txt"),
    durationSec: 704.34,
    properNouns: [
      "이규연",
      "KTV",
      "이성택",
      "뉴시스",
      "YTN",
      "코리아헤럴드",
      "오마이뉴스",
      "SBS 비즈",
    ],
    kind: "clova",
  },
];

function numberArg(name: string, fallback: number) {
  const prefix = `${name}=`;
  const raw = process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function referenceParagraphs(fixture: Fixture) {
  const raw = readFileSync(fixture.reference, "utf8").replace(/^\uFEFF/, "");
  if (fixture.kind === "brief") {
    return raw
      .split(/\r?\n/)
      .map((line) => line.replace(ROLE_TAG, "").trim())
      .filter((line) => line.length >= 20 && !INAUDIBLE.test(line))
      .map(normalize);
  }
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length >= 20 &&
        !/^참석자\s+\d+\s+\d{2}:\d{2}$/.test(line) &&
        !/^\d{4}\.\d{2}\.\d{2}/.test(line) &&
        !/^ktv-briefing/i.test(line),
    )
    .map(normalize);
}

function properNounRecall(text: string, terms: string[]) {
  const haystack = normalize(text);
  const found = terms.filter((term) => haystack.includes(normalize(term)));
  return {
    found,
    missing: terms.filter((term) => !found.includes(term)),
    recall: found.length / Math.max(1, terms.length),
  };
}

function timingIntegrity(result: ChunkedTranscribeResult) {
  let invalid = 0;
  let reversed = 0;
  let previous = -1;
  for (const word of result.wordTimings) {
    if (
      !Number.isFinite(word.startSec) ||
      !Number.isFinite(word.endSec) ||
      word.startSec < 0 ||
      word.endSec > result.durationSec + 1
    ) {
      invalid += 1;
    }
    if (word.endSec < word.startSec || word.startSec + 0.05 < previous) {
      reversed += 1;
    }
    previous = Math.max(previous, word.startSec);
  }
  return {
    words: result.wordTimings.length,
    invalid,
    reversed,
    valid: result.wordTimings.length > 0 && invalid === 0 && reversed === 0,
  };
}

function cachePath(id: string, glossaryMode: "none" | "reference" | "media") {
  return join(
    OUT,
    `${id}__${MODEL}__flac-parallel${glossaryMode === "none" ? "" : `-${glossaryMode}-glossary`}.json`,
  );
}

async function runFixture(
  fixture: Fixture,
  fresh: boolean,
  glossaryMode: "none" | "reference" | "media",
) {
  const cache = cachePath(fixture.id, glossaryMode);
  let result: ChunkedTranscribeResult | null =
    !fresh && existsSync(cache)
      ? (JSON.parse(readFileSync(cache, "utf8")) as ChunkedTranscribeResult)
      : null;
  let wallMs = 0;
  if (!result) {
    if (!fresh) {
      throw new Error(
        `${fixture.id}: cache 없음. 유료 실행은 --fresh로 명시하세요.`,
      );
    }
    const started = Date.now();
    result = await chunkedTranscribe({
      audioPath: fixture.audio,
      workDir: join(OUT, `work-${fixture.id}`),
      model: MODEL,
      wordTimestamps: true,
      ...(glossaryMode === "reference"
        ? { glossary: fixture.properNouns }
        : glossaryMode === "media"
          ? { glossary: [...MEDIA_OUTLET_TERMS] }
          : {}),
      onProgress: (progress) => {
        process.stderr.write(
          `[${fixture.id}] ${progress.step} ${progress.completedUnits}/${progress.totalUnits}\n`,
        );
      },
    });
    wallMs = Date.now() - started;
    writeFileSync(cache, JSON.stringify(result, null, 2), "utf8");
  }
  const cer = alignedCer(referenceParagraphs(fixture), normalize(result.text));
  return {
    id: fixture.id,
    durationSec: result.durationSec,
    wallMs,
    realtimeFactor: wallMs > 0 ? wallMs / 1000 / result.durationSec : null,
    cer: cer.cer,
    matchedParagraphs: cer.matched,
    totalParagraphs: cer.total,
    referenceChars: cer.refChars,
    properNouns: properNounRecall(result.text, fixture.properNouns),
    timing: timingIntegrity(result),
    estimatedUsd: result.usage.estimatedUsd,
    usage: result.usage,
    chunkCount: result.chunkCount,
    textChars: result.text.length,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const fresh = process.argv.includes("--fresh");
  const glossary = process.argv.includes("--glossary");
  const mediaGlossary = process.argv.includes("--media-glossary");
  if (glossary && mediaGlossary) {
    throw new Error("--glossary와 --media-glossary는 동시에 쓸 수 없습니다.");
  }
  const glossaryMode = mediaGlossary
    ? "media"
    : glossary
      ? "reference"
      : "none";
  const onlyArg = process.argv
    .find((value) => value.startsWith("--only="))
    ?.slice("--only=".length);
  const only = onlyArg ? new Set(onlyArg.split(",").filter(Boolean)) : null;
  const selected = only
    ? FIXTURE_SPECS.filter((fixture) => only.has(fixture.id))
    : FIXTURE_SPECS;
  if (selected.length === 0 || (only && selected.length !== only.size)) {
    throw new Error("--only에 알 수 없는 평가 fixture가 있습니다.");
  }
  const budgetUsd = numberArg("--budget-usd", DEFAULT_TOTAL_BUDGET_USD);
  const priorSpentUsd = numberArg(
    "--prior-spent-usd",
    PRIOR_DOCUMENTED_USD,
  );
  const requested = selected.reduce(
    (sum, fixture) =>
      sum +
      estimateSttUsdFromMinutes(MODEL, fixture.durationSec) +
      estimateSttUsdFromMinutes("whisper-1", fixture.durationSec),
    0,
  );
  const projectedTotal = priorSpentUsd + requested;
  if (fresh && projectedTotal > budgetUsd) {
    throw new Error(
      `예산 차단: 기존 $${priorSpentUsd.toFixed(4)} + 예상 $${requested.toFixed(4)} = $${projectedTotal.toFixed(4)} > $${budgetUsd.toFixed(2)}`,
    );
  }
  console.error(
    `[budget] prior=$${priorSpentUsd.toFixed(4)} requested<=${requested.toFixed(4)} total<=${projectedTotal.toFixed(4)} limit=$${budgetUsd.toFixed(2)}`,
  );

  const results = await Promise.all(
    selected.map((fixture) => runFixture(fixture, fresh, glossaryMode)),
  );
  const actualNewUsd = results.reduce(
    (sum, result) => sum + result.estimatedUsd,
    0,
  );
  const referenceChars = results.reduce(
    (sum, result) => sum + result.referenceChars,
    0,
  );
  const weightedCer =
    results.reduce(
      (sum, result) => sum + result.cer * result.referenceChars,
      0,
    ) / Math.max(1, referenceChars);
  const foundTerms = results.reduce(
    (sum, result) => sum + result.properNouns.found.length,
    0,
  );
  const totalTerms = results.reduce(
    (sum, result) =>
      sum + result.properNouns.found.length + result.properNouns.missing.length,
    0,
  );
  const report = {
    generatedAt: new Date().toISOString(),
    pipeline: `gpt-transcribe + whisper-1 words, FLAC chunks, parallel timing${glossaryMode === "none" ? "" : `, ${glossaryMode} glossary`}`,
    budget: {
      limitUsd: budgetUsd,
      priorDocumentedUsd: priorSpentUsd,
      preflightNewUsd: requested,
      actualNewUsd,
      documentedTotalUsd: priorSpentUsd + actualNewUsd,
      withinBudget: priorSpentUsd + actualNewUsd <= budgetUsd,
    },
    aggregate: {
      weightedCer,
      properNounRecall: foundTerms / Math.max(1, totalTerms),
      timingValid: results.every((result) => result.timing.valid),
      deploymentGatePassed:
        weightedCer <= 0.12 &&
        results.every((result) => result.properNouns.recall >= 0.6) &&
        results.every((result) => result.timing.valid),
      missingMetrics: [
        "3개 정책 브리핑 정답에는 화자별 절대 시각/고유 ID가 없어 speaker-transition F1을 계산할 수 없음",
        "단어 기준 정답 시각이 없어 word timing MAE를 계산할 수 없음",
        "요약 근거율은 구조화 단계 평가에서 별도 산출 필요",
      ],
    },
    results,
  };
  writeFileSync(
    join(
      OUT,
      glossaryMode === "none"
        ? "summary.json"
        : `summary-${glossaryMode}-glossary.json`,
    ),
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.budget.withinBudget || !report.aggregate.deploymentGatePassed) {
    process.exitCode = 1;
  }
}

void main();
