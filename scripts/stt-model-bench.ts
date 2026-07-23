/**
 * STT 모델 벤치: 샘플 × 모델 4종 × (원문/보정)
 * SAMPLE_ONLY=assembly2 로 단일 샘플만 실행 후 results.json에 병합
 * 결과: .data/stt-bench/results.json
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const OUT = ".data/stt-bench";
const SAMPLE_ONLY = (process.env.SAMPLE_ONLY || "").trim();

const MODELS = [
  "whisper-1",
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe-diarize",
] as const;

type Model = (typeof MODELS)[number];

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
];

const CORRECT_SYSTEM =
  "너는 회의록 보정 전문가다. 입력된 회의 텍스트를 받아 다음 형식의 JSON으로만 응답하라:\n" +
  '{"corrected_text": "문법과 맞춤법을 보정한 전체 텍스트", ' +
  '"summary": "핵심 내용 요약 (3~5문장)", ' +
  '"action_items": ["액션 아이템 1", "액션 아이템 2"]}';

function getClient() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === "your_openai_api_key_here") {
    throw new Error("OPENAI_API_KEY missing");
  }
  return new OpenAI({ apiKey: key });
}

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
  const dist = levenshtein(r, h);
  return Math.max(0, 1 - dist / r.length);
}

function score(ref: string, hyp: string, mode: "full" | "coverage") {
  const cov = coverage(ref, hyp);
  const cer = cerAccuracy(ref, hyp);
  // full: CER 정확도, coverage: 정답 포함률. 표시용으로 둘 다 기록
  const primary = mode === "full" ? cer : cov;
  return {
    accuracyPct: Math.round(primary * 1000) / 10,
    coveragePct: Math.round(cov * 1000) / 10,
    cerAccuracyPct: Math.round(cer * 1000) / 10,
  };
}

async function transcribe(
  client: OpenAI,
  model: Model,
  bytes: Buffer,
  filename: string,
) {
  const file = await toFile(bytes, filename);
  if (model === "gpt-4o-transcribe-diarize") {
    const res = await client.audio.transcriptions.create({
      model,
      file,
      response_format: "diarized_json",
      chunking_strategy: "auto",
    } as unknown as Parameters<
      typeof client.audio.transcriptions.create
    >[0]);
    const anyRes = res as {
      text?: string;
      segments?: Array<{ speaker?: string; text?: string }>;
    };
    const fromSeg =
      anyRes.segments
        ?.map((s) => {
          const sp = s.speaker ? `[${s.speaker}] ` : "";
          return `${sp}${s.text || ""}`.trim();
        })
        .filter(Boolean)
        .join("\n") || "";
    return {
      text: anyRes.text || fromSeg,
      diarized: fromSeg || anyRes.text || "",
      segmentCount: anyRes.segments?.length ?? 0,
    };
  }

  const res = await client.audio.transcriptions.create({
    model,
    file,
  });
  return {
    text: res.text || "",
    diarized: "",
    segmentCount: 0,
  };
}

async function correctText(client: OpenAI, text: string) {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CORRECT_SYSTEM },
      { role: "user", content: text },
    ],
  });
  const raw = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as { corrected_text?: string };
  return parsed.corrected_text || text;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const client = getClient();
  const runSamples = SAMPLE_ONLY
    ? SAMPLES.filter((s) => s.id === SAMPLE_ONLY)
    : SAMPLES;
  if (SAMPLE_ONLY && runSamples.length === 0) {
    throw new Error(`unknown SAMPLE_ONLY=${SAMPLE_ONLY}`);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const sample of runSamples) {
    if (!existsSync(sample.audio) || !existsSync(sample.reference)) {
      throw new Error(`missing files for ${sample.id}`);
    }
    const bytes = readFileSync(sample.audio);
    const ref = readFileSync(sample.reference, "utf8");

    for (const model of MODELS) {
      console.log(`\n=== ${sample.id} / ${model} ===`);
      const t0 = Date.now();
      const stt = await transcribe(
        client,
        model,
        bytes,
        `${sample.id}.mp3`,
      );
      const sttMs = Date.now() - t0;
      console.log(`STT done ${sttMs}ms chars=${stt.text.length}`);

      const rawScore = score(ref, stt.text, sample.scoreMode);
      results.push({
        sampleId: sample.id,
        sampleLabel: sample.label,
        model,
        corrected: false,
        ...rawScore,
        sttMs,
        textChars: stt.text.length,
        segmentCount: stt.segmentCount,
        textPath: `${sample.id}__${model}__raw.txt`,
      });
      writeFileSync(
        join(OUT, `${sample.id}__${model}__raw.txt`),
        stt.text,
        "utf8",
      );
      if (stt.diarized) {
        writeFileSync(
          join(OUT, `${sample.id}__${model}__diarized.txt`),
          stt.diarized,
          "utf8",
        );
      }

      const c0 = Date.now();
      const corrected = await correctText(client, stt.text);
      const correctMs = Date.now() - c0;
      const corrScore = score(ref, corrected, sample.scoreMode);
      console.log(
        `CORRECT done ${correctMs}ms acc ${rawScore.accuracyPct}% -> ${corrScore.accuracyPct}%`,
      );
      results.push({
        sampleId: sample.id,
        sampleLabel: sample.label,
        model,
        corrected: true,
        ...corrScore,
        sttMs,
        correctMs,
        textChars: corrected.length,
        segmentCount: stt.segmentCount,
        textPath: `${sample.id}__${model}__corrected.txt`,
      });
      writeFileSync(
        join(OUT, `${sample.id}__${model}__corrected.txt`),
        corrected,
        "utf8",
      );
    }
  }

  let merged = results;
  let prevEstimate: Record<string, unknown> | undefined;
  if (SAMPLE_ONLY && existsSync(join(OUT, "results.json"))) {
    const prev = JSON.parse(readFileSync(join(OUT, "results.json"), "utf8")) as {
      results?: Array<Record<string, unknown>>;
      estimateUsd?: Record<string, unknown>;
    };
    prevEstimate = prev.estimateUsd;
    const kept = (prev.results || []).filter((r) => r.sampleId !== SAMPLE_ONLY);
    merged = [...kept, ...results];
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    estimateUsd: prevEstimate || {
      stt: 0.64,
      correct: "0.05-0.20",
      total: "0.70-0.95",
      note: "이전 2샘플 기준. assembly2 추가분은 별도",
    },
    samples: SAMPLES.map((s) => ({
      id: s.id,
      label: s.label,
      minutes: s.minutes,
      scoreMode: s.scoreMode,
    })),
    models: [...MODELS],
    results: merged,
  };
  writeFileSync(join(OUT, "results.json"), JSON.stringify(payload, null, 2));
  console.log("\nWrote", join(OUT, "results.json"));
  console.table(
    results.map((r) => ({
      sample: r.sampleId,
      model: r.model,
      corr: r.corrected,
      acc: r.accuracyPct,
      cov: r.coveragePct,
    })),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
