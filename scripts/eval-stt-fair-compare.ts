/**
 * Fair STT compare: whisper-1 / gpt-4o-mini-transcribe / gpt-4o-transcribe
 * 동일 chunked-continue 파이프라인(chunkedTranscribe)으로 점수 비교.
 *
 * SAMPLE_ONLY=assembly3,finance 로 선택 실행 가능 (쉼표 구분).
 * MERGE_PRIOR=1(기본): 미실행 샘플은 기존 fair-compare/summary.json과 병합.
 * 결과: .data/stt-bench/fair-compare/summary.json
 *       .data/stt-bench/fair-compare/summary-extra.json (추가샘플 시)
 *       Faith-office/Faith_STT공정비교_whisper_vs_4o_2026-07-23.txt
 *       Faith-office/Faith_STT공정비교_추가샘플_2026-07-23.txt
 */
import { config } from "dotenv";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { chunkedTranscribe, CHUNK_SEC } from "@/lib/stt/chunked-transcribe";
import type { SttModel } from "@/lib/stt/models";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const ROOT = process.cwd();
const OUT = join(ROOT, ".data/stt-bench");
const FAIR_DIR = join(OUT, "fair-compare");
const REPORT_PATH = join(
  ROOT,
  "Faith-office/Faith_STT공정비교_whisper_vs_4o_2026-07-23.txt",
);
const EXTRA_REPORT_PATH = join(
  ROOT,
  "Faith-office/Faith_STT공정비교_추가샘플_2026-07-23.txt",
);

const SAMPLE_ONLY = (process.env.SAMPLE_ONLY || "").trim();
/** comma-separated ids; when set, also merge prior fair-compare/summary.json for 5-sample avg */
const MERGE_PRIOR = (process.env.MERGE_PRIOR || "1").trim() !== "0";

const MODELS: SttModel[] = [
  "whisper-1",
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
];

const SAMPLES = [
  {
    id: "assembly",
    label: "국회 환노위 424-2 (18.5분)",
    audio: join(OUT, "assembly-envlabor-20250425.mp3"),
    reference: join(OUT, "reference.txt"),
    minutes: 18.57,
    scoreMode: "full" as const,
  },
  {
    id: "assembly2",
    label: "국회 환노위 426-3 (12.6분)",
    audio: join(OUT, "assembly2-envlabor-20250704.mp3"),
    reference: join(OUT, "assembly2-reference.txt"),
    minutes: 12.62,
    scoreMode: "full" as const,
  },
  {
    id: "ktv",
    label: "KTV 브리핑 (11.7분)",
    audio: join(OUT, "ktv-briefing-20251231.mp3"),
    reference: join(OUT, "ktv-reference.txt"),
    minutes: 11.74,
    scoreMode: "coverage" as const,
  },
  {
    id: "assembly3",
    label: "국회 환노위 426-2 (13.9분)",
    audio: join(OUT, "assembly3-envlabor-20250630.mp3"),
    reference: join(OUT, "assembly3-reference.txt"),
    minutes: 13.9,
    scoreMode: "full" as const,
  },
  {
    id: "finance",
    label: "국회 기재위 426-2 (11.3분)",
    audio: join(OUT, "finance-planning-20250702.mp3"),
    reference: join(OUT, "finance-reference.txt"),
    minutes: 11.27,
    scoreMode: "full" as const,
  },
];

const EXTRA_SAMPLE_IDS = new Set(["assembly3", "finance"]);

function compact(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\w가-힣]/g, "");
}

function bigrams(s: string) {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

function coverage(ref: string, hyp: string) {
  const r = compact(ref);
  const h = compact(hyp);
  if (!r.length) return 0;
  const rb = bigrams(r);
  const hb = bigrams(h);
  let hit = 0;
  for (const g of rb) if (hb.has(g)) hit++;
  return rb.size ? hit / rb.size : 0;
}

function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n];
}

function cerAccuracy(ref: string, hyp: string) {
  const r = compact(ref);
  const h = compact(hyp);
  if (!r.length) return 0;
  return Math.max(0, 1 - levenshtein(r, h) / r.length);
}

function score(ref: string, hyp: string, mode: "full" | "coverage") {
  const cov = coverage(ref, hyp);
  const cer = cerAccuracy(ref, hyp);
  const primary = mode === "full" ? cer : cov;
  return {
    accuracyPct: Math.round(primary * 1000) / 10,
    coveragePct: Math.round(cov * 1000) / 10,
    cerAccuracyPct: Math.round(cer * 1000) / 10,
  };
}

type Row = {
  sampleId: string;
  sampleLabel: string;
  model: SttModel;
  scoreMode: "full" | "coverage";
  pipeline: "chunked-continue";
  chunkSec: number;
  chunkCount: number;
  durationSec: number;
  accuracyPct: number;
  coveragePct: number;
  cerAccuracyPct: number;
  textChars: number;
  sttMs: number;
  estimatedUsd: number;
  priorUnfairAccuracyPct: number | null;
  priorUnfairTextChars: number | null;
  priorPipeline: string | null;
  textPath: string;
};

function loadPriorUnfair(): Map<string, { accuracyPct: number; textChars: number; pipeline: string | null }> {
  const map = new Map<string, { accuracyPct: number; textChars: number; pipeline: string | null }>();
  const path = join(OUT, "results.json");
  if (!existsSync(path)) return map;
  const prev = JSON.parse(readFileSync(path, "utf8")) as {
    results?: Array<Record<string, unknown>>;
  };
  for (const r of prev.results || []) {
    if (r.corrected !== false) continue;
    const model = String(r.model);
    if (!MODELS.includes(model as SttModel)) continue;
    const key = `${r.sampleId}__${model}`;
    map.set(key, {
      accuracyPct: Number(r.accuracyPct),
      textChars: Number(r.textChars),
      pipeline: typeof r.pipeline === "string" ? r.pipeline : null,
    });
  }
  return map;
}

function avg(nums: number[]) {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function judgmentLines(averages: Record<string, number>) {
  const w = averages["whisper-1"] ?? 0;
  const mini = averages["gpt-4o-mini-transcribe"] ?? 0;
  const full = averages["gpt-4o-transcribe"] ?? 0;
  const best4o = Math.max(mini, full);
  const gap = Math.round((w - best4o) * 10) / 10;
  const lines: string[] = [];
  lines.push("판정");
  if (Math.abs(gap) < 2) {
    lines.push(
      `- 동일 chunked-continue 조건에서 세 모델 accuracy는 거의 동등(평균 차이 ${Math.abs(gap)}%p 미만). whisper 우위는 accuracy만으로 성립하지 않으며, 타임스탬프·비용이 제품 결정의 주 근거.`,
    );
  } else if (gap > 0) {
    lines.push(
      `- 동일 조건에서도 whisper-1이 평균 ${gap}%p 앞선다. accuracy만 보면 whisper 선택이 타당하나, 격차가 크지 않으면 타임스탬프·비용과 함께 판단.`,
    );
  } else {
    lines.push(
      `- 동일 조건에서 4o 계열이 평균 ${Math.abs(gap)}%p 앞선다. accuracy만으로는 whisper 고수 근거가 약해지고, whisper는 타임스탬프·비용 측면에서 검토.`,
    );
  }
  return { lines, gap };
}

function writeReport(
  rows: Row[],
  averages: Record<string, number>,
  opts: {
    path: string;
    title: string;
    sampleFilter?: (id: string) => boolean;
    combinedAverages?: Record<string, number> | null;
    note?: string[];
  },
) {
  const lines: string[] = [];
  lines.push(opts.title);
  lines.push("날짜: 2026-07-23");
  lines.push("");
  lines.push("조건");
  lines.push(`- 파이프라인: chunkedTranscribe, ${CHUNK_SEC}초 청크, 직전 문맥 prompt 이어전사`);
  lines.push("- 모델: whisper-1, gpt-4o-mini-transcribe, gpt-4o-transcribe");
  lines.push("- 지표: full 샘플은 CER accuracyPct, ktv는 coveragePct (기존 bench와 동일)");
  lines.push("- 이전 bench 불공정: assembly는 mini/4o만 chunked, assembly2는 mini/4o one-shot(문자 수 짧음)");
  if (opts.note?.length) {
    lines.push("");
    for (const n of opts.note) lines.push(n);
  }
  lines.push("");
  lines.push("샘플별 점수 (accuracyPct / coveragePct / chars)");
  for (const sample of SAMPLES) {
    if (opts.sampleFilter && !opts.sampleFilter(sample.id)) continue;
    const sampleRows = rows.filter((r) => r.sampleId === sample.id);
    if (!sampleRows.length) continue;
    lines.push("");
    lines.push(`[${sample.id}] ${sample.label} (scoreMode=${sample.scoreMode})`);
    for (const r of sampleRows) {
      const delta =
        r.priorUnfairAccuracyPct != null
          ? ` (이전 ${r.priorUnfairAccuracyPct}% / ${r.priorUnfairTextChars}자)`
          : "";
      lines.push(
        `- ${r.model}: acc ${r.accuracyPct}% , cov ${r.coveragePct}% , chars ${r.textChars} , ${r.sttMs}ms , ~$${r.estimatedUsd.toFixed(4)}${delta}`,
      );
    }
  }
  lines.push("");
  lines.push("공정 평균 accuracyPct (이번 실행 샘플)");
  for (const model of MODELS) {
    lines.push(`- ${model}: ${averages[model] ?? 0}%`);
  }
  const { lines: judge, gap } = judgmentLines(averages);
  lines.push("");
  lines.push(...judge);

  if (opts.combinedAverages) {
    lines.push("");
    lines.push("5샘플 합산 평균 accuracyPct (기존 3 + 추가 2)");
    for (const model of MODELS) {
      lines.push(`- ${model}: ${opts.combinedAverages[model] ?? 0}%`);
    }
    const { lines: judge5, gap: gap5 } = judgmentLines(opts.combinedAverages);
    lines.push("");
    lines.push("5샘플 판정");
    lines.push(...judge5.slice(1));
    if (Math.abs(gap5) < 2 && Math.abs(gap) < 2) {
      lines.push(
        "- 결론 변화: 없음. 추가샘플 평가만으로도 whisper vs 4o accuracy 동등 판정 유지. 결정 문서(Faith_STT시각_타임라인_결정_2026-07-23.txt)는 수정하지 않음.",
      );
    }
  }
  lines.push("");
  writeFileSync(opts.path, lines.join("\n"), "utf8");
}

function loadPriorFairRows(): Row[] {
  const path = join(FAIR_DIR, "summary.json");
  if (!existsSync(path)) return [];
  const prev = JSON.parse(readFileSync(path, "utf8")) as {
    results?: Row[];
  };
  return Array.isArray(prev.results) ? prev.results : [];
}

async function main() {
  mkdirSync(FAIR_DIR, { recursive: true });
  mkdirSync(join(ROOT, "Faith-office"), { recursive: true });

  const onlyIds = SAMPLE_ONLY
    ? SAMPLE_ONLY.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const runSamples = onlyIds.length
    ? SAMPLES.filter((s) => onlyIds.includes(s.id))
    : SAMPLES;
  if (onlyIds.length && runSamples.length === 0) {
    throw new Error(`unknown SAMPLE_ONLY=${SAMPLE_ONLY}`);
  }

  const prior = loadPriorUnfair();
  const rows: Row[] = [];

  for (const sample of runSamples) {
    if (!existsSync(sample.audio) || !existsSync(sample.reference)) {
      throw new Error(`missing files for ${sample.id}`);
    }
    const ref = readFileSync(sample.reference, "utf8");

    for (const model of MODELS) {
      console.log(`\n=== FAIR ${sample.id} / ${model} ===`);
      const workDir = join(FAIR_DIR, `work_${sample.id}_${model.replace(/[^a-z0-9-]/gi, "_")}`);
      mkdirSync(workDir, { recursive: true });

      const t0 = Date.now();
      const run = await chunkedTranscribe({
        audioPath: sample.audio,
        workDir: join(workDir, "chunks"),
        model,
        chunkSec: CHUNK_SEC,
      });
      const sttMs = Date.now() - t0;
      const sc = score(ref, run.text, sample.scoreMode);
      const textPath = `${sample.id}__${model}__fair-chunked.txt`;
      writeFileSync(join(FAIR_DIR, textPath), run.text, "utf8");

      const priorKey = `${sample.id}__${model}`;
      const p = prior.get(priorKey) ?? null;

      const row: Row = {
        sampleId: sample.id,
        sampleLabel: sample.label,
        model,
        scoreMode: sample.scoreMode,
        pipeline: "chunked-continue",
        chunkSec: CHUNK_SEC,
        chunkCount: run.chunkCount,
        durationSec: run.durationSec,
        ...sc,
        textChars: run.text.length,
        sttMs,
        estimatedUsd: run.usage.estimatedUsd,
        priorUnfairAccuracyPct: p?.accuracyPct ?? null,
        priorUnfairTextChars: p?.textChars ?? null,
        priorPipeline: p?.pipeline ?? null,
        textPath,
      };
      rows.push(row);
      console.log(
        `acc ${sc.accuracyPct}% cov ${sc.coveragePct}% chars ${run.text.length} chunks ${run.chunkCount} ${sttMs}ms ~$${run.usage.estimatedUsd.toFixed(4)}`,
      );
    }
  }

  const averages: Record<string, number> = {};
  for (const model of MODELS) {
    averages[model] = avg(
      rows.filter((r) => r.model === model).map((r) => r.accuracyPct),
    );
  }

  // Merge prior fair rows for samples not re-run this session
  let combinedRows = rows;
  if (MERGE_PRIOR) {
    const priorRows = loadPriorFairRows();
    const runIds = new Set(rows.map((r) => r.sampleId));
    const kept = priorRows.filter((r) => !runIds.has(r.sampleId));
    combinedRows = [...kept, ...rows];
  }

  const combinedAverages: Record<string, number> = {};
  for (const model of MODELS) {
    combinedAverages[model] = avg(
      combinedRows.filter((r) => r.model === model).map((r) => r.accuracyPct),
    );
  }

  const perSample: Record<string, Record<string, number>> = {};
  for (const sample of SAMPLES) {
    const sampleRows = combinedRows.filter((r) => r.sampleId === sample.id);
    if (!sampleRows.length) continue;
    perSample[sample.id] = {};
    for (const model of MODELS) {
      const row = sampleRows.find((r) => r.model === model);
      if (row) perSample[sample.id]![model] = row.accuracyPct;
    }
  }

  const w = combinedAverages["whisper-1"] ?? 0;
  const mini = combinedAverages["gpt-4o-mini-transcribe"] ?? 0;
  const full = combinedAverages["gpt-4o-transcribe"] ?? 0;
  const best4o = Math.max(mini, full);
  const gapWhisperVsBest4o = Math.round((w - best4o) * 10) / 10;

  let recommendation: string;
  if (Math.abs(gapWhisperVsBest4o) < 2) {
    recommendation =
      "동일 chunked-continue 조건에서 accuracy는 거의 동등하다. whisper를 timestamps용으로 쓰는 제품 결정은 accuracy 우위가 아니라 타임스탬프·비용이 주 근거다.";
  } else if (gapWhisperVsBest4o > 0) {
    recommendation = `동일 조건에서도 whisper-1이 평균 ${gapWhisperVsBest4o}%p 앞선다. accuracy만 보면 whisper 선택이 타당하나, 타임스탬프·비용과 함께 판단한다.`;
  } else {
    recommendation = `동일 조건에서 4o 계열이 평균 ${Math.abs(gapWhisperVsBest4o)}%p 앞선다. accuracy만으로는 whisper 고수 근거가 약하고, whisper는 타임스탬프·비용 측면에서 검토한다.`;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    scenario:
      "모든 모델에 chunkedTranscribe(5분 청크, 직전 문맥 prompt 이어전사)를 동일 적용. 이전 bench의 one-shot vs chunked 불공정 제거.",
    chunkSec: CHUNK_SEC,
    models: MODELS,
    samples: SAMPLES.filter((s) =>
      combinedRows.some((r) => r.sampleId === s.id),
    ).map((s) => ({
      id: s.id,
      label: s.label,
      minutes: s.minutes,
      scoreMode: s.scoreMode,
    })),
    results: combinedRows,
    runThisSession: rows.map((r) => ({ sampleId: r.sampleId, model: r.model })),
    fairAvgAccuracyPctThisRun: averages,
    fairAvgAccuracyPct: combinedAverages,
    perSampleAccuracyPct: perSample,
    gapWhisperVsBest4oPctPoints: gapWhisperVsBest4o,
    recommendation,
  };

  writeFileSync(
    join(FAIR_DIR, "summary.json"),
    JSON.stringify(payload, null, 2),
    "utf8",
  );
  writeFileSync(
    join(FAIR_DIR, "summary-extra.json"),
    JSON.stringify(
      {
        generatedAt: payload.generatedAt,
        extraSamples: runSamples
          .filter((s) => EXTRA_SAMPLE_IDS.has(s.id))
          .map((s) => ({
            id: s.id,
            label: s.label,
            minutes: s.minutes,
            scoreMode: s.scoreMode,
            gold: s.reference.replace(ROOT + "/", ""),
            audio: s.audio.replace(ROOT + "/", ""),
          })),
        results: rows,
        fairAvgAccuracyPctExtra: averages,
        fairAvgAccuracyPctAll5: combinedAverages,
        gapWhisperVsBest4oPctPoints: gapWhisperVsBest4o,
        recommendation,
        decisionDocUpdated: false,
        note: "추가샘플 평가만. 결정 문서 미수정.",
      },
      null,
      2,
    ),
    "utf8",
  );

  const ranExtra = rows.some((r) => EXTRA_SAMPLE_IDS.has(r.sampleId));
  if (ranExtra) {
    writeReport(rows, averages, {
      path: EXTRA_REPORT_PATH,
      title: "Faith STT 공정 비교 추가샘플 (chunked-continue 동일 조건)",
      sampleFilter: (id) => EXTRA_SAMPLE_IDS.has(id),
      combinedAverages,
      note: [
        "추가샘플 평가만",
        "- 신규 골드: 국회회의록 spk_sub (공식 속기)",
        "- assembly3: 제426회 환노위 제2차 (2025-06-30), conferNum N053087, 13.9분",
        "- finance: 제426회 기재위 제2차 (2025-07-02), conferNum N053100, 11.3분",
        "- 기존 3샘플(assembly/assembly2/ktv) 점수는 fair-compare/summary.json에서 병합",
      ],
    });
  }

  // Keep original 3-sample report intact unless full re-run of those samples
  const ranOriginal = rows.some((r) => !EXTRA_SAMPLE_IDS.has(r.sampleId));
  if (ranOriginal && !ranExtra) {
    writeReport(rows, averages, {
      path: REPORT_PATH,
      title: "Faith STT 공정 비교 (chunked-continue 동일 조건)",
    });
  } else if (!onlyIds.length) {
    writeReport(combinedRows, combinedAverages, {
      path: REPORT_PATH,
      title: "Faith STT 공정 비교 (chunked-continue 동일 조건)",
    });
  }

  console.log("\nWrote", join(FAIR_DIR, "summary.json"));
  if (ranExtra) console.log("Wrote", EXTRA_REPORT_PATH);
  console.table(
    rows.map((r) => ({
      sample: r.sampleId,
      model: r.model,
      acc: r.accuracyPct,
      cov: r.coveragePct,
      chars: r.textChars,
      prior: r.priorUnfairAccuracyPct,
      ms: r.sttMs,
    })),
  );
  console.log("\nThis-run avg:", averages);
  console.log("Combined 5-sample avg:", combinedAverages);
  console.log("Gap whisper - best4o:", gapWhisperVsBest4o, "%p");
  console.log(recommendation);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
