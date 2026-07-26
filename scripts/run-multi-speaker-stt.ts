/**
 * One-shot multi-speaker STT run (realtime + upload models).
 * No pyannote. Outputs: .data/stt-bench/multi-speaker-run-20260727/
 *
 * npx tsx --tsconfig tsconfig.json scripts/run-multi-speaker-stt.ts
 */
import { config } from "dotenv";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const OUT = join(process.cwd(), ".data/stt-bench/multi-speaker-run-20260727");
const FIXTURE_DIR = join(process.cwd(), ".data/stt-bench/fixtures");
const MANIFEST_PATH = join(FIXTURE_DIR, "assembly3-dense-180.json");
const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
  fixtureId: string;
  selection: {
    selected: {
      startSec: number;
      endSec: number;
      durationSec: number;
      speakerCount: number;
      transitionCount: number;
    };
  };
  source: { file: string; sha256: string };
  clip: { file: string; bytes: number; sha256: string; format: string };
};
const CLIP = join(FIXTURE_DIR, manifest.clip.file);
const WORK = join(OUT, "work");

const UPLOAD_MODELS = [
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
  "gpt-4o-transcribe-diarize",
] as const;

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function inputMeta() {
  return {
    fixtureId: manifest.fixtureId,
    clipFile: manifest.clip.file,
    clipSha256: manifest.clip.sha256,
    segmentSec: [
      manifest.selection.selected.startSec,
      manifest.selection.selected.endSec,
    ],
    durationSec: manifest.selection.selected.durationSec,
  };
}

function getClient() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === "your_openai_api_key_here") {
    throw new Error("OPENAI_API_KEY missing");
  }
  return new OpenAI({ apiKey: key });
}

async function runRealtime() {
  const { realtimeTranscribeFile } = await import(
    "../src/lib/stt/realtime/transcribe-session"
  );
  console.log("\n=== REALTIME STT (gpt-realtime-whisper, diarization=none) ===");
  let lastLog = 0;
  const started = Date.now();
  const stt = await realtimeTranscribeFile(CLIP, {
    language: "ko",
    onProgress: (p) => {
      const now = Date.now();
      if (now - lastLog < 5000) return;
      lastLog = now;
      console.log(
        `  … audio=${p.audioSentSec.toFixed(0)}s utterances=${p.utterances.length}`,
      );
    },
  });
  const row = {
    path: "realtime",
    status: "ok" as const,
    model: stt.model,
    input: inputMeta(),
    durationSec: stt.durationSec,
    wallMs: stt.wallMs,
    firstDeltaMs: stt.firstDeltaMs,
    utteranceCount: stt.utterances.length,
    chars: stt.text.length,
    estimatedUsd: stt.estimatedUsd,
    eventCounts: stt.eventCounts,
    elapsedWallMs: Date.now() - started,
  };
  writeFileSync(
    join(OUT, "realtime.json"),
    JSON.stringify({ ...row, text: stt.text, utterances: stt.utterances }, null, 2),
  );
  writeFileSync(join(OUT, "realtime.txt"), stt.text);
  console.log(JSON.stringify(row, null, 2));
  return row;
}

async function runUploadModel(
  client: OpenAI,
  model: (typeof UPLOAD_MODELS)[number],
) {
  console.log(`\n=== UPLOAD STT (${model}) ===`);
  const bytes = readFileSync(CLIP);
  const started = Date.now();
  try {
    if (model === "gpt-4o-transcribe-diarize") {
      const file = await toFile(bytes, "clip.wav");
      const res = await client.audio.transcriptions.create({
        model,
        file,
        response_format: "diarized_json",
        chunking_strategy: "auto",
        language: "ko",
      } as unknown as Parameters<typeof client.audio.transcriptions.create>[0]);
      const anyRes = res as {
        text?: string;
        usage?: unknown;
        segments?: Array<{
          speaker?: string;
          text?: string;
          start?: number;
          end?: number;
        }>;
      };
      const diarized =
        anyRes.segments
          ?.map((s) => {
            const sp = (s.speaker || "A").trim() || "A";
            const text = (s.text || "").trim();
            if (!text) return "";
            if (
              typeof s.start === "number" &&
              Number.isFinite(s.start) &&
              typeof s.end === "number" &&
              Number.isFinite(s.end)
            ) {
              return `[${sp}][${s.start.toFixed(3)}-${s.end.toFixed(3)}] ${text}`;
            }
            return `[${sp}] ${text}`;
          })
          .filter(Boolean)
          .join("\n") || "";
      const missingTimes = (anyRes.segments || []).some((s) => {
        const text = (s.text || "").trim();
        if (!text) return false;
        return !(
          typeof s.start === "number" &&
          Number.isFinite(s.start) &&
          typeof s.end === "number" &&
          Number.isFinite(s.end)
        );
      });
      if ((anyRes.segments?.length ?? 0) > 0 && missingTimes) {
        throw new Error(
          "diarized_json segments에 start/end가 없습니다. 싱크 저장을 중단합니다.",
        );
      }
      const text = (anyRes.text || diarized).trim();
      const speakers = new Set(
        (anyRes.segments || [])
          .map((s) => s.speaker)
          .filter((s): s is string => Boolean(s)),
      );
      const wallMs = Date.now() - started;
      const estimatedUsd =
        (manifest.selection.selected.durationSec / 60) * 0.006;
      const row = {
        path: "upload",
        status: "ok" as const,
        model,
        input: inputMeta(),
        durationSec: manifest.selection.selected.durationSec,
        wallMs,
        chars: text.length,
        segmentCount: anyRes.segments?.length ?? 0,
        speakerCount: speakers.size,
        estimatedUsd,
        usage: anyRes.usage ?? null,
      };
      writeFileSync(
        join(OUT, `upload__${model}.json`),
        JSON.stringify(
          { ...row, text, diarized, segments: anyRes.segments },
          null,
          2,
        ),
      );
      writeFileSync(join(OUT, `upload__${model}.txt`), text);
      writeFileSync(join(OUT, `upload__${model}__diarized.txt`), diarized);
      console.log(JSON.stringify(row, null, 2));
      return row;
    }

    const { chunkedTranscribeBuffer } = await import(
      "../src/lib/stt/chunked-transcribe"
    );
    const { estimateSttUsdFromMinutes, estimateSttUsdFromTokens } = await import(
      "../src/lib/stt/pricing"
    );
    const workDir = join(WORK, model);
    mkdirSync(workDir, { recursive: true });
    const stt = await chunkedTranscribeBuffer({
      audioBytes: bytes,
      filename: manifest.clip.file,
      workDir,
      model,
    });
    const wallMs = Date.now() - started;
    const fromTokens = estimateSttUsdFromTokens(
      model,
      stt.usage.inputTokens,
      stt.usage.outputTokens,
    );
    const estimatedUsd =
      fromTokens ?? estimateSttUsdFromMinutes(model, stt.durationSec);
    const row = {
      path: "upload",
      status: "ok" as const,
      model,
      input: inputMeta(),
      durationSec: stt.durationSec,
      wallMs,
      chars: stt.text.length,
      chunkCount: stt.chunkCount,
      usage: stt.usage,
      estimatedUsd,
    };
    writeFileSync(
      join(OUT, `upload__${model}.json`),
      JSON.stringify({ ...row, text: stt.text, parts: stt.parts }, null, 2),
    );
    writeFileSync(join(OUT, `upload__${model}.txt`), stt.text);
    console.log(JSON.stringify(row, null, 2));
    return row;
  } catch (err) {
    const wallMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    const row = {
      path: "upload",
      status: "fail" as const,
      model,
      input: inputMeta(),
      wallMs,
      error: message,
    };
    writeFileSync(join(OUT, `upload__${model}.json`), JSON.stringify(row, null, 2));
    console.error("FAIL", model, message);
    return row;
  }
}

async function main() {
  mkdirSync(WORK, { recursive: true });
  if (!existsSync(CLIP)) throw new Error(`missing clip ${CLIP}`);
  const actualClipHash = sha256(CLIP);
  if (actualClipHash !== manifest.clip.sha256) {
    throw new Error(
      `clip hash mismatch: expected ${manifest.clip.sha256}, got ${actualClipHash}`,
    );
  }

  const summary: Array<Record<string, unknown>> = [];

  try {
    summary.push(await runRealtime());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const row = {
      path: "realtime",
      status: "fail",
      model: "gpt-realtime-whisper",
      input: inputMeta(),
      error: message,
    };
    summary.push(row);
    writeFileSync(join(OUT, "realtime.json"), JSON.stringify(row, null, 2));
    console.error("REALTIME FAIL", message);
  }

  const client = getClient();
  for (const model of UPLOAD_MODELS) {
    summary.push(await runUploadModel(client, model));
  }

  const meta = {
    createdAt: new Date().toISOString(),
    clip: inputMeta(),
    source: manifest.source,
    selection: manifest.selection.selected,
    diarization: "none",
    results: summary,
  };
  writeFileSync(join(OUT, "summary.json"), JSON.stringify(meta, null, 2));
  console.log("\nwrote", join(OUT, "summary.json"));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
