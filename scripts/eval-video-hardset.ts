/**
 * Faith-office/08_검증_정답셋/.../05_영상자료의 활성 검증클립 평가.
 *
 * 기본은 캐시 전용이다. --fresh-stt 또는 --judge를 명시할 때만 API를 호출한다.
 * 공식 속기와 자동자막은 같은 등급의 정답으로 취급하지 않는다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import OpenAI from "openai";

import {
  chunkedTranscribe,
  type ChunkedTranscribeResult,
} from "../src/lib/stt/chunked-transcribe";
import { estimateSttUsdFromMinutes } from "../src/lib/stt/pricing";
import {
  glueBoundaryFragmentSpeakers,
  prunePhantomSpeakers,
  type DiarizationResult,
} from "../src/lib/stt/diarization";
import { normalize } from "./lib/cer";

const ROOT = process.cwd();
const DATASET = join(
  ROOT,
  "Faith-office/08_검증_정답셋/Faith_브리핑_클로바_정답셋_2026-08-03/05_영상자료",
);
const OUT = join(ROOT, ".data/stt-bench/video-hardset");

type Fixture = {
  id: string;
  category: "public-briefing" | "hearing";
  media: string;
  reference: string;
  source: string;
  durationSec: number;
  referenceAuthority: "official-stenography" | "auto-caption-weak";
  expectedSpeakerRange: [number, number];
  properNouns: string[];
  handoffs: Array<{ label: string; beforeSec: number; afterSec: number }>;
  identityChecks: Array<{
    label: string;
    leftSec: number;
    rightSec: number;
    expected: "same" | "different";
  }>;
};

const FIXTURES: Fixture[] = [
  {
    id: "brief-infosec-20251022",
    category: "public-briefing",
    media: join(
      DATASET,
      "01_공공브리핑/검증클립/범정부_정보보호_종합대책_2025-10-22/01_범정부_정보보호_종합대책_00h00m00s-00h18m16s.mp4",
    ),
    reference: join(
      DATASET,
      "01_공공브리핑/검증클립/범정부_정보보호_종합대책_2025-10-22/01_범정부_정보보호_종합대책.reference.txt",
    ),
    source: join(
      DATASET,
      "01_공공브리핑/검증클립/범정부_정보보호_종합대책_2025-10-22/source.md",
    ),
    durationSec: 1096.026,
    referenceAuthority: "official-stenography",
    // 발표·사회 2명, 여러 부처 답변자, 기자 질문자를 합친 약한 범위다.
    expectedSpeakerRange: [9, 16],
    properNouns: [
      "배경훈",
      "과학기술정보통신부",
      "금융위원회",
      "개인정보보호위원회",
      "국정원",
      "1600",
      "펨토셀",
      "CISO",
    ],
    handoffs: [
      { label: "사회자→첫 기자", beforeSec: 388, afterSec: 399 },
      { label: "첫 기자→부총리", beforeSec: 408, afterSec: 413 },
      { label: "사회자→과기정통부 답변", beforeSec: 570, afterSec: 578 },
      { label: "부처 답변→다음 기자", beforeSec: 643, afterSec: 652 },
      { label: "부총리→금융위 답변", beforeSec: 798, afterSec: 808 },
      { label: "사회자→마지막 기자", beforeSec: 1018, afterSec: 1028 },
    ],
    identityChecks: [
      { label: "발표 중간 조각은 같은 부총리", leftSec: 88, rightSec: 100, expected: "same" },
      { label: "발표와 첫 답변은 같은 부총리", leftSec: 100, rightSec: 413, expected: "same" },
      { label: "사회자와 내일신문 기자는 다름", leftSec: 388, rightSec: 652, expected: "different" },
      { label: "첫 기자와 내일신문 기자는 다름", leftSec: 399, rightSec: 652, expected: "different" },
      { label: "과기정통부 답변 연속", leftSec: 578, rightSec: 643, expected: "same" },
      { label: "과기정통부와 금융위 답변자는 다름", leftSec: 578, rightSec: 808, expected: "different" },
      { label: "부총리와 금융위 답변자는 다름", leftSec: 798, rightSec: 808, expected: "different" },
      { label: "내일신문과 마지막 기자는 다름", leftSec: 652, rightSec: 1028, expected: "different" },
    ],
  },
  {
    id: "hearing-kim-minseok-004145-010145",
    category: "hearing",
    media: join(
      DATASET,
      "02_국회청문회/검증클립/김민석_인사청문회_00h41m45s-01h01m45s/02_김민석_인사청문회_00h41m45s-01h01m45s.mp4",
    ),
    reference: join(
      DATASET,
      "02_국회청문회/검증클립/김민석_인사청문회_00h41m45s-01h01m45s/captions.auto.ko.vtt",
    ),
    source: join(
      DATASET,
      "02_국회청문회/검증클립/김민석_인사청문회_00h41m45s-01h01m45s/source.md",
    ),
    durationSec: 1200,
    referenceAuthority: "auto-caption-weak",
    // 위원장, 앞 질문자, 오기형·최혜영·주진우, 후보자가 이 구간에 등장한다.
    expectedSpeakerRange: [5, 8],
    // 제목에만 있고 실제 구간에서 호명되지 않은 이름은 넣지 않는다.
    properNouns: [
      "김희정",
      "오기형",
      "최혜영",
      "주진우",
      "윤석열",
      "이재명",
      "국민의힘",
      "이태원",
      "오송",
    ],
    handoffs: [
      { label: "위원장→오기형", beforeSec: 28, afterSec: 45 },
      { label: "오기형 종료→최혜영", beforeSec: 468, afterSec: 485 },
      { label: "최혜영 종료→주진우", beforeSec: 918, afterSec: 928 },
    ],
    identityChecks: [
      { label: "위원장 재등장 1", leftSec: 28, rightSec: 470, expected: "same" },
      { label: "위원장 재등장 2", leftSec: 470, rightSec: 918, expected: "same" },
      { label: "오기형과 최혜영은 다름", leftSec: 45, rightSec: 485, expected: "different" },
      { label: "최혜영과 주진우는 다름", leftSec: 485, rightSec: 928, expected: "different" },
      { label: "후보자 답변 재등장", leftSec: 180, rightSec: 570, expected: "same" },
      { label: "오기형과 후보자는 다름", leftSec: 100, rightSec: 180, expected: "different" },
    ],
  },
];

type SemanticVerdict = {
  verdict: "pass" | "warn" | "fail";
  meaningPreservation: number;
  storyFlow: number;
  contradictions: string[];
  majorOmissions: string[];
  flowBreaks: string[];
  rationale: string;
  evidence?: string[];
  judge?: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

function numberArg(name: string, fallback: number) {
  const raw = process.argv
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function selectedFixtures() {
  const raw = process.argv
    .find((value) => value.startsWith("--only="))
    ?.slice("--only=".length);
  if (!raw) return FIXTURES;
  const ids = new Set(raw.split(",").filter(Boolean));
  const selected = FIXTURES.filter((fixture) => ids.has(fixture.id));
  if (selected.length !== ids.size) throw new Error("--only에 모르는 fixture가 있습니다.");
  return selected;
}

function vttText(raw: string) {
  const cues = raw.split(/\r?\n\r?\n/u);
  const out: string[] = [];
  let previous = "";
  for (const cue of cues) {
    const lines = cue
      .split(/\r?\n/u)
      .filter((line) => line.trim() && !/^WEBVTT/u.test(line) && !/-->/u.test(line))
      .map((line) => line.replace(/<[^>]+>/gu, "").trim())
      .filter(Boolean);
    const newest = lines.at(-1) ?? "";
    if (!newest || newest === previous) continue;
    out.push(newest);
    previous = newest;
  }
  return out.join("\n");
}

function referenceText(fixture: Fixture) {
  const raw = readFileSync(fixture.reference, "utf8").replace(/^\uFEFF/u, "");
  return fixture.referenceAuthority === "auto-caption-weak" ? vttText(raw) : raw;
}

function chunks(text: string, maxChars = 520) {
  const lines = text
    .split(/\r?\n/u)
    .map((line) => line.replace(/^\[[^\]]+\]\s*/u, "").trim())
    .filter((line) => line.length >= 8);
  const out: string[] = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + line.length + 1 > maxChars) {
      out.push(current);
      current = "";
    }
    current += `${current ? " " : ""}${line}`;
  }
  if (current) out.push(current);
  return out;
}

function bigrams(text: string) {
  const value = normalize(text);
  const out = new Set<string>();
  for (let index = 0; index + 1 < value.length; index += 1) {
    out.add(value.slice(index, index + 2));
  }
  return out;
}

function similarity(left: string, hypothesisBigrams: Set<string>) {
  const source = bigrams(left);
  if (source.size === 0) return 0;
  let matched = 0;
  for (const gram of source) if (hypothesisBigrams.has(gram)) matched += 1;
  return matched / source.size;
}

/** 전체 전문에서 실제 클립과 겹치는 부분만 골라 의미 심사 입력 낭비를 줄인다. */
function relevantReference(reference: string, hypothesis: string) {
  const passages = chunks(reference);
  const hypothesisPassages = chunks(hypothesis);
  const anchors: Array<{ index: number; score: number }> = [];
  let cursor = 0;
  for (const hypothesisPassage of hypothesisPassages) {
    const grams = bigrams(hypothesisPassage);
    let best = { index: cursor, score: 0 };
    const from = Math.max(0, cursor - 2);
    const to = Math.min(passages.length, cursor + 20);
    for (let index = from; index < to; index += 1) {
      const score = similarity(passages[index]!, grams);
      if (score > best.score) best = { index, score };
    }
    if (best.score < 0.05) continue;
    anchors.push(best);
    // 속기와 전사는 문단 길이가 달라 같은 문단에 여러 번 걸릴 수 있다.
    // 뒤로만 진행하되 한 번 일치했다고 무조건 다음 문단으로 넘기지 않는다.
    cursor = Math.max(cursor, best.index);
  }
  const indices = anchors.map((anchor) => anchor.index);
  const lastAnchor =
    indices.length > 0
      ? Math.max(...indices)
      : Math.min(passages.length - 1, 35);
  // 현재 활성 자료는 영상과 reference가 모두 클립 시작 0초에 맞춰져 있다.
  // 첫 몇 문장이 짧아 유사도 anchor를 못 얻더라도 도입부를 버리지 않는다.
  const first = 0;
  const last = Math.min(
    passages.length - 1,
    lastAnchor + 1,
  );
  const selected = passages.slice(first, last + 1).join("\n");
  return (selected || passages.slice(0, 36).join("\n")).slice(0, 24_000);
}

function properNounResult(text: string, terms: string[]) {
  const haystack = normalize(text);
  const found = terms.filter((term) => haystack.includes(normalize(term)));
  return {
    found,
    missing: terms.filter((term) => !found.includes(term)),
    recall: found.length / Math.max(1, terms.length),
  };
}

function cachePath(fixture: Fixture) {
  return join(OUT, `${fixture.id}__gpt-transcribe.json`);
}

function judgeCachePath(fixture: Fixture, model: string) {
  return join(
    OUT,
    `${fixture.id}__semantic-flow-v4-${model.replace(/[^a-z0-9.-]+/giu, "-")}.json`,
  );
}

function cachedJudge(fixture: Fixture) {
  const model = process.env.VIDEO_HARDSET_JUDGE_MODEL?.trim() || "gpt-4o";
  const path = judgeCachePath(fixture, model);
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as SemanticVerdict)
    : null;
}

async function transcribe(fixture: Fixture, fresh: boolean) {
  const path = cachePath(fixture);
  if (!fresh) {
    return existsSync(path)
      ? (JSON.parse(readFileSync(path, "utf8")) as ChunkedTranscribeResult)
      : null;
  }
  const result = await chunkedTranscribe({
    audioPath: fixture.media,
    workDir: join(OUT, `work-${fixture.id}`),
    model: "gpt-transcribe",
    wordTimestamps: true,
    onProgress: (progress) => {
      process.stderr.write(
        `[${fixture.id}] ${progress.step} ${progress.completedUnits}/${progress.totalUnits}\n`,
      );
    },
  });
  writeFileSync(path, JSON.stringify(result, null, 2), "utf8");
  return result;
}

async function judge(
  fixture: Fixture,
  reference: string,
  hypothesis: string,
): Promise<SemanticVerdict> {
  const judgeModel = process.env.VIDEO_HARDSET_JUDGE_MODEL?.trim() || "gpt-4o";
  const cache = judgeCachePath(fixture, judgeModel);
  if (existsSync(cache)) {
    return JSON.parse(readFileSync(cache, "utf8")) as SemanticVerdict;
  }
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY가 없습니다. 안전 래퍼로 실행하세요.");
  const client = new OpenAI({ apiKey: key });
  const evidence = relevantReference(reference, hypothesis);
  writeFileSync(
    join(OUT, `${fixture.id}__semantic-reference-v3.txt`),
    evidence,
    "utf8",
  );
  const response = await client.chat.completions.create({
    model: judgeModel,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "당신은 한국어 속기 검증자다. 글자 그대로가 아니라 의미와 이야기 흐름을 판정한다. 조사, 말버릇, 동의어, 경미한 문장 생략은 허용한다. 인물·기관·숫자·부정·인과·주장의 방향이 바뀌거나 주요 발언 순서가 뒤집히면 실패다. reference가 자동자막이면 그 자체의 명백한 오타는 정답으로 강요하지 않는다. reference는 전체 자료 중 hypothesis와 겹치는 구간만 추린 것이므로 그 밖의 내용 누락은 실패가 아니다. 모순·순서 역전을 주장하려면 양쪽의 구체적 근거를 evidence에 적어라. 근거가 없으면 실패로 판정하지 마라. JSON만 반환한다.",
      },
      {
        role: "user",
        content: JSON.stringify({
          referenceAuthority: fixture.referenceAuthority,
          acceptance:
            "다른 의미로 보이지 않고 핵심 이야기 흐름이 유지되면 pass. 부분 누락은 warn, 모순이나 의미 반전은 fail.",
          outputSchema: {
            verdict: "pass|warn|fail",
            meaningPreservation: "0..1",
            storyFlow: "0..1",
            contradictions: ["string"],
            majorOmissions: ["string"],
            flowBreaks: ["string"],
            rationale: "string",
            evidence: ["reference와 hypothesis의 짧은 대응 근거"],
          },
          reference: evidence,
          hypothesis: hypothesis.slice(0, 28_000),
        }),
      },
    ],
  });
  const raw = response.choices[0]?.message.content;
  if (!raw) throw new Error(`${fixture.id}: 의미 심사 응답이 비었습니다.`);
  const result = JSON.parse(raw) as SemanticVerdict;
  result.judge = {
    model: judgeModel,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
  };
  writeFileSync(cache, JSON.stringify(result, null, 2), "utf8");
  return result;
}

function diarizationCandidates(fixture: Fixture) {
  const ledger = join(ROOT, ".data/stt-bench/model-lab/summary.json");
  if (!existsSync(ledger)) return [];
  const summary = JSON.parse(readFileSync(ledger, "utf8")) as {
    runs?: Array<Record<string, unknown>>;
  };
  const rows = (summary.runs ?? []).filter(
    (row) => row.task === "diarization" && row.fixtureId === fixture.id,
  );
  return rows.map((row) => {
    const rawSegments = Array.isArray(row.segments)
      ? (row.segments as Array<{
          startSec: number;
          endSec: number;
          speaker: string;
        }>)
      : [];
    const model = String(row.model ?? "unknown");
    const durationSec = Number(row.durationSec ?? fixture.durationSec);
    const raw: DiarizationResult = {
      model,
      device: String(
        (row.runtime as { device?: unknown } | undefined)?.device ?? "unknown",
      ),
      durationSec,
      wallMs: Number(
        (row.runtime as { wallMs?: unknown } | undefined)?.wallMs ?? 0,
      ),
      speakerCount: new Set(rawSegments.map((segment) => segment.speaker)).size,
      segments: rawSegments,
    };
    const product = model.includes("sherpa-")
      ? glueBoundaryFragmentSpeakers(prunePhantomSpeakers(raw))
      : raw;
    const segments = product.segments;
    const speakerAt = (timeSec: number) =>
      segments.find(
        (segment) => segment.startSec <= timeSec && segment.endSec >= timeSec,
      )?.speaker ?? null;
    const handoffs = fixture.handoffs.map((handoff) => {
      const before = speakerAt(handoff.beforeSec);
      const after = speakerAt(handoff.afterSec);
      return {
        ...handoff,
        before,
        after,
        pass: before != null && after != null && before !== after,
      };
    });
    const identityChecks = fixture.identityChecks.map((check) => {
      const left = speakerAt(check.leftSec);
      const right = speakerAt(check.rightSec);
      const observed =
        left == null || right == null
          ? "unknown"
          : left === right
            ? "same"
            : "different";
      return { ...check, left, right, observed, pass: observed === check.expected };
    });
    const speakerCount = product.speakerCount;
    return {
      id: row.id,
      model,
      speakerCount,
      rawSpeakerCount: raw.speakerCount,
      expectedSpeakerRange: fixture.expectedSpeakerRange,
      speakerCountPlausible:
        speakerCount >= fixture.expectedSpeakerRange[0] &&
        speakerCount <= fixture.expectedSpeakerRange[1],
      segmentCount: segments.length,
      rawSegmentCount: rawSegments.length,
      runtime: row.runtime,
      cost: row.cost,
      handoffs,
      handoffPassCount: handoffs.filter((handoff) => handoff.pass).length,
      handoffCheckCount: handoffs.length,
      identityChecks,
      identityPassCount: identityChecks.filter((check) => check.pass).length,
      identityCheckCount: identityChecks.length,
    };
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const selected = selectedFixtures();
  for (const fixture of selected) {
    for (const path of [fixture.media, fixture.reference, fixture.source]) {
      if (!existsSync(path)) throw new Error(`${fixture.id}: 파일 없음 ${path}`);
    }
  }
  const fresh = process.argv.includes("--fresh-stt");
  const useJudge = process.argv.includes("--judge");
  const budgetUsd = numberArg("--budget-usd", 0.5);
  const preflightUsd = selected.reduce(
    (sum, fixture) =>
      sum +
      estimateSttUsdFromMinutes("gpt-transcribe", fixture.durationSec) +
      estimateSttUsdFromMinutes("whisper-1", fixture.durationSec),
    0,
  );
  if (fresh && preflightUsd > budgetUsd) {
    throw new Error(
      `예산 차단: 예상 최대 $${preflightUsd.toFixed(4)} > $${budgetUsd.toFixed(2)}`,
    );
  }
  console.error(
    `[budget] fresh=${fresh} preflight<=${preflightUsd.toFixed(4)} limit=$${budgetUsd.toFixed(2)}`,
  );

  const rows = [];
  for (const fixture of selected) {
    const stt = await transcribe(fixture, fresh);
    const reference = referenceText(fixture);
    const candidates = diarizationCandidates(fixture);
    rows.push({
      fixture: {
        ...fixture,
        media: fixture.media.slice(ROOT.length + 1),
        reference: fixture.reference.slice(ROOT.length + 1),
        source: fixture.source.slice(ROOT.length + 1),
      },
      stt: stt
        ? {
            cache: cachePath(fixture).slice(ROOT.length + 1),
            textChars: stt.text.length,
            wordTimingCount: stt.wordTimings.length,
            durationSec: stt.durationSec,
            usage: stt.usage,
            properNouns: properNounResult(stt.text, fixture.properNouns),
            semanticFlow: useJudge
              ? await judge(fixture, reference, stt.text)
              : cachedJudge(fixture),
          }
        : null,
      diarization: candidates.at(-1) ?? null,
      diarizationCandidates: candidates,
      limitations:
        fixture.referenceAuthority === "official-stenography"
          ? ["공식 전문은 클립과 시간 정렬되지 않아 의미·흐름 정답으로 사용"]
          : [
              "YouTube 자동자막은 약한 의미 정답이며 CER 정답으로 사용 금지",
              "화자별 절대 시각 정답이 없어 경계 F1은 계산하지 않음",
            ],
    });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    datasetRoot: DATASET.slice(ROOT.length + 1),
    policy: {
      officialStenography: "의미·주요 주장·이야기 순서가 같으면 통과",
      autoCaptionWeak: "명백한 자동자막 오타를 강요하지 않고 의미 반전만 실패",
      noInventedGold: "화자 절대 시각이 없으면 speaker F1을 만들지 않음",
    },
    budget: { preflightUsd, limitUsd: budgetUsd, fresh },
    rows,
  };
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(report, null, 2), "utf8");
  const markdown = [
    "# Faith 영상 hard-set 평가",
    "",
    `생성: ${report.generatedAt}`,
    "",
    "| fixture | 정답 등급 | 의미 | 흐름 | 고유명사 | 단어 시각 |",
    "|---|---|---:|---:|---:|---:|",
    ...rows.map((row) => {
      const semantic = row.stt?.semanticFlow;
      const properNouns = row.stt?.properNouns;
      return `| ${row.fixture.id} | ${row.fixture.referenceAuthority} | ${semantic ? `${semantic.verdict} ${(semantic.meaningPreservation * 100).toFixed(0)}%` : "-"} | ${semantic ? `${(semantic.storyFlow * 100).toFixed(0)}%` : "-"} | ${properNouns ? `${properNouns.found.length}/${properNouns.found.length + properNouns.missing.length}` : "-"} | ${row.stt?.wordTimingCount ?? "-"} |`;
    }),
    "",
    "## 판정 원칙",
    "",
    "- 공식 속기: 글자 일치보다 의미, 주요 주장, 이야기 순서가 같으면 통과한다.",
    "- 자동자막: 약한 의미 정답이다. 자막 자체의 명백한 오타는 정답으로 강요하지 않는다.",
    "- 화자별 절대 시각이 없으면 speaker-transition F1을 만들지 않는다.",
    "- `--fresh-stt` 또는 `--judge` 없이는 새 유료 API 호출을 하지 않는다.",
    "",
    "## 화자분리 후보",
    "",
    "| fixture | 후보 | 제품 화자 수(raw) | 범위 | 인접 전환 | 화자 동일성 | 시간 | 비용 |",
    "|---|---|---:|---|---:|---:|---:|---:|",
    ...rows.flatMap((row) =>
      row.diarizationCandidates.map((candidate) => {
        const runtime = candidate.runtime as { wallMs?: number } | undefined;
        const cost = candidate.cost as { estimatedUsd?: number } | undefined;
        return `| ${row.fixture.id} | ${candidate.model}${String(candidate.id).includes("t800") ? " 0.80" : String(candidate.id).includes("t850") ? " 0.85" : ""} | ${candidate.speakerCount} (${candidate.rawSpeakerCount}) | ${candidate.speakerCountPlausible ? "통과" : "범위 밖"} | ${candidate.handoffPassCount}/${candidate.handoffCheckCount} | ${candidate.identityPassCount}/${candidate.identityCheckCount} | ${runtime?.wallMs == null ? "-" : `${(runtime.wallMs / 1000).toFixed(1)}초`} | ${cost?.estimatedUsd == null ? "-" : `$${cost.estimatedUsd.toFixed(4)}`} |`;
      }),
    ),
    "",
  ].join("\n");
  writeFileSync(join(OUT, "summary.md"), markdown, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

void main();
