/**
 * 4o / 4o-mini: API prompt만 적용 (클라이언트 청크·이어붙이기 없음)
 * 끊김이 프롬프트로 완화되는지 확인
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const OUT = ".data/stt-bench";

const PROMPT =
  "이 파일은 회의 전체 녹음이다. 시작부터 끝까지 발화를 빠짐없이 전부 전사하라. " +
  "요약하지 말고, 중간·후반을 생략하지 말며, 들은 내용만 순서대로 적는다.";

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

async function transcribeWithPrompt(
  client: OpenAI,
  model: (typeof MODELS)[number],
  bytes: Buffer,
  prompt: string | undefined,
) {
  const file = await toFile(bytes, "assembly.mp3");
  const res = await client.audio.transcriptions.create({
    model,
    file,
    ...(prompt ? { prompt } : {}),
  });
  return res.text || "";
}

async function main() {
  if (!existsSync(SAMPLE.audio) || !existsSync(SAMPLE.reference)) {
    throw new Error("missing sample files");
  }
  const client = getClient();
  const bytes = readFileSync(SAMPLE.audio);
  const ref = readFileSync(SAMPLE.reference, "utf8");
  const prev = JSON.parse(readFileSync(join(OUT, "results.json"), "utf8")) as {
    results: Array<Record<string, unknown>>;
  };

  const rows: Array<Record<string, unknown>> = [];

  for (const model of MODELS) {
    const baseline = prev.results.find(
      (r) =>
        r.sampleId === SAMPLE.id &&
        r.model === model &&
        r.corrected === false,
    );

    console.log(`\n=== ${model} + prompt ===`);
    const t0 = Date.now();
    const text = await transcribeWithPrompt(client, model, bytes, PROMPT);
    const sttMs = Date.now() - t0;
    const sc = score(ref, text);
    writeFileSync(
      join(OUT, `${SAMPLE.id}__${model}__prompt.txt`),
      text,
      "utf8",
    );

    const row = {
      sampleId: SAMPLE.id,
      sampleName: SAMPLE.name,
      model,
      promptUsed: true,
      prompt: PROMPT,
      sttMs,
      textChars: text.length,
      ...sc,
      baselineAccuracyPct: baseline?.accuracyPct ?? null,
      baselineCoveragePct: baseline?.coveragePct ?? null,
      baselineTextChars: baseline?.textChars ?? null,
      textPath: `${SAMPLE.id}__${model}__prompt.txt`,
    };
    rows.push(row);
    console.log(
      `CER ${sc.accuracyPct}% (was ${baseline?.accuracyPct}) chars ${text.length} (was ${baseline?.textChars})`,
    );
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    note: "클라이언트 청크·이어붙이기 없음. API prompt 파라미터만 사용.",
    sample: SAMPLE,
    prompt: PROMPT,
    results: rows,
  };
  writeFileSync(
    join(OUT, "prompt-only-results.json"),
    JSON.stringify(payload, null, 2),
    "utf8",
  );
  console.log("\nWrote", join(OUT, "prompt-only-results.json"));
  console.table(
    rows.map((r) => ({
      model: r.model,
      cer: r.accuracyPct,
      cer0: r.baselineAccuracyPct,
      chars: r.textChars,
      chars0: r.baselineTextChars,
      cov: r.coveragePct,
    })),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
