/**
 * 4o / 4o-mini: 길이 기반 청크 + 이전 전사를 prompt로 이어 전사
 * (시나리오: 길이→청크 분할, 각 호출은 API. 이어붙이기는 청크 결과 순서 연결)
 */
import { config } from "dotenv";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const OUT = ".data/stt-bench";
const CHUNK_DIR = join(OUT, "chunks-assembly");
const CHUNK_SEC = 300; // 5분

const MODELS = ["gpt-4o-transcribe", "gpt-4o-mini-transcribe"] as const;

const SAMPLE = {
  id: "assembly",
  name: "추경 의결",
  audio: join(OUT, "assembly-envlabor-20250425.mp3"),
  reference: join(OUT, "reference.txt"),
};

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

function score(ref: string, hyp: string) {
  const cov = coverage(ref, hyp);
  const cer = cerAccuracy(ref, hyp);
  return {
    accuracyPct: Math.round(cer * 1000) / 10,
    coveragePct: Math.round(cov * 1000) / 10,
    cerAccuracyPct: Math.round(cer * 1000) / 10,
  };
}

function getClient() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === "your_openai_api_key_here") {
    throw new Error("OPENAI_API_KEY missing");
  }
  return new OpenAI({ apiKey: key });
}

function audioDurationSec(path: string) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      path,
    ],
    { encoding: "utf8" },
  ).trim();
  return Number(out);
}

function prepareChunks(audioPath: string, chunkSec: number) {
  mkdirSync(CHUNK_DIR, { recursive: true });
  for (const f of readdirSync(CHUNK_DIR)) {
    if (f.endsWith(".mp3")) unlinkSync(join(CHUNK_DIR, f));
  }
  // 길이 파악 후 ffmpeg segment (시나리오 설정). 이어쓰기는 API prompt가 담당.
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      audioPath,
      "-f",
      "segment",
      "-segment_time",
      String(chunkSec),
      "-c",
      "copy",
      "-reset_timestamps",
      "1",
      join(CHUNK_DIR, "part_%03d.mp3"),
    ],
    { stdio: "pipe" },
  );
  return readdirSync(CHUNK_DIR)
    .filter((f) => f.startsWith("part_") && f.endsWith(".mp3"))
    .sort()
    .map((f) => join(CHUNK_DIR, f));
}

/** 이전 청크 끝부분을 prompt로 넘겨 모델이 문맥을 이어가게 함 */
function continuePrompt(prevText: string, chunkIndex: number, total: number) {
  const tail = prevText.replace(/\s+/g, " ").trim().slice(-800);
  return (
    `이 파일은 회의 녹음의 ${chunkIndex + 1}/${total} 구간이다. ` +
    `앞 구간에서 이어지는 발화를 처음부터 끝까지 빠짐없이 전사하라. 요약·생략 금지.\n` +
    `직전 전사 끝부분(문맥용):\n${tail}`
  );
}

async function transcribeChunk(
  client: OpenAI,
  model: (typeof MODELS)[number],
  bytes: Buffer,
  filename: string,
  prompt: string | undefined,
) {
  const file = await toFile(bytes, filename);
  const res = await client.audio.transcriptions.create({
    model,
    file,
    ...(prompt ? { prompt } : {}),
  });
  return (res.text || "").trim();
}

async function runChunked(
  client: OpenAI,
  model: (typeof MODELS)[number],
  chunks: string[],
) {
  const parts: string[] = [];
  let prev = "";
  const perChunk: Array<{ index: number; chars: number; ms: number }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const bytes = readFileSync(chunks[i]);
    const prompt =
      i === 0
        ? "회의 녹음 시작 구간이다. 처음부터 끝까지 빠짐없이 전사하라. 요약·생략 금지."
        : continuePrompt(prev, i, chunks.length);
    const t0 = Date.now();
    const text = await transcribeChunk(
      client,
      model,
      bytes,
      `part_${i}.mp3`,
      prompt,
    );
    const ms = Date.now() - t0;
    parts.push(text);
    prev = text;
    perChunk.push({ index: i, chars: text.length, ms });
    console.log(`  chunk ${i + 1}/${chunks.length}: ${text.length} chars, ${ms}ms`);
  }

  return {
    text: parts.filter(Boolean).join("\n"),
    parts,
    perChunk,
  };
}

async function main() {
  if (!existsSync(SAMPLE.audio) || !existsSync(SAMPLE.reference)) {
    throw new Error("missing sample files");
  }
  const client = getClient();
  const ref = readFileSync(SAMPLE.reference, "utf8");
  const durationSec = audioDurationSec(SAMPLE.audio);
  const chunks = prepareChunks(SAMPLE.audio, CHUNK_SEC);
  console.log(
    `duration=${durationSec.toFixed(1)}s chunkSec=${CHUNK_SEC} chunks=${chunks.length}`,
  );

  const prev = JSON.parse(readFileSync(join(OUT, "results.json"), "utf8")) as {
    results: Array<Record<string, unknown>>;
  };
  const promptOnly = existsSync(join(OUT, "prompt-only-results.json"))
    ? (JSON.parse(
        readFileSync(join(OUT, "prompt-only-results.json"), "utf8"),
      ) as { results: Array<Record<string, unknown>> })
    : null;

  const rows: Array<Record<string, unknown>> = [];

  for (const model of MODELS) {
    console.log(`\n=== ${model} chunked continue ===`);
    const t0 = Date.now();
    const run = await runChunked(client, model, chunks);
    const totalMs = Date.now() - t0;
    const sc = score(ref, run.text);
    writeFileSync(
      join(OUT, `${SAMPLE.id}__${model}__chunked.txt`),
      run.text,
      "utf8",
    );

    const baseline = prev.results.find(
      (r) =>
        r.sampleId === SAMPLE.id &&
        r.model === model &&
        r.corrected === false,
    );
    const oneShotPrompt = promptOnly?.results.find((r) => r.model === model);

    const row = {
      sampleId: SAMPLE.id,
      sampleName: SAMPLE.name,
      model,
      mode: "chunked-continue",
      chunkSec: CHUNK_SEC,
      chunkCount: chunks.length,
      durationSec,
      totalMs,
      textChars: run.text.length,
      ...sc,
      baselineAccuracyPct: baseline?.accuracyPct ?? null,
      baselineTextChars: baseline?.textChars ?? null,
      promptOnlyAccuracyPct: oneShotPrompt?.accuracyPct ?? null,
      promptOnlyTextChars: oneShotPrompt?.textChars ?? null,
      perChunk: run.perChunk,
      textPath: `${SAMPLE.id}__${model}__chunked.txt`,
    };
    rows.push(row);
    console.log(
      `CER ${sc.accuracyPct}% chars ${run.text.length} (baseline ${baseline?.accuracyPct}% / ${baseline?.textChars})`,
    );
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    scenario:
      "ffprobe로 길이 확인 → ffmpeg 5분 청크 → 각 청크를 API 전사. 2번째부터 prompt에 직전 구간 끝 문맥 전달. 결과는 순서대로 연결.",
    sample: SAMPLE,
    chunkSec: CHUNK_SEC,
    results: rows,
  };
  writeFileSync(
    join(OUT, "chunked-continue-results.json"),
    JSON.stringify(payload, null, 2),
    "utf8",
  );
  console.log("\nWrote", join(OUT, "chunked-continue-results.json"));
  console.table(
    rows.map((r) => ({
      model: r.model,
      cer: r.accuracyPct,
      cer0: r.baselineAccuracyPct,
      cerPrompt: r.promptOnlyAccuracyPct,
      chars: r.textChars,
      chars0: r.baselineTextChars,
      charsPrompt: r.promptOnlyTextChars,
      chunks: r.chunkCount,
    })),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
