/**
 * 실시간 STT 모델 비교 (고정 180초 클립).
 * gpt-realtime-whisper($0.017/분) vs gpt-4o-mini-transcribe + server_vad($0.003/분)
 *
 * MODEL=mini npx tsx --tsconfig tsconfig.json scripts/eval-realtime-model.ts
 */
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const FIXTURE_DIR = join(process.cwd(), ".data/stt-bench/fixtures");
const OUT = join(process.cwd(), ".data/stt-bench/realtime-model-compare");

async function main() {
  const { realtimeTranscribeFile } = await import(
    "../src/lib/stt/realtime/transcribe-session"
  );
  const { REALTIME_STT_MINI, REALTIME_STT_WHISPER } = await import(
    "../src/lib/stt/realtime/types"
  );

  const manifest = JSON.parse(
    readFileSync(join(FIXTURE_DIR, "assembly3-dense-180.json"), "utf8"),
  ) as { clip: { file: string } };
  const clip = join(FIXTURE_DIR, manifest.clip.file);

  const which = (process.env.MODEL ?? "mini").toLowerCase();
  const model = which === "whisper" ? REALTIME_STT_WHISPER : REALTIME_STT_MINI;

  mkdirSync(OUT, { recursive: true });
  console.log(`=== realtime ${model} ===`);

  let lastLog = 0;
  const stt = await realtimeTranscribeFile(clip, {
    language: "ko",
    model,
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
    model: stt.model,
    durationSec: stt.durationSec,
    wallMs: stt.wallMs,
    firstDeltaMs: stt.firstDeltaMs,
    utteranceCount: stt.utterances.length,
    chars: stt.text.length,
    droppedTurns: stt.droppedTurns,
    estimatedUsd: stt.estimatedUsd,
    lastUtteranceStartSec: stt.utterances.at(-1)?.startSec ?? null,
    eventCounts: stt.eventCounts,
  };
  console.log(JSON.stringify(row, null, 2));

  writeFileSync(
    join(OUT, `${stt.model}.json`),
    JSON.stringify({ ...row, utterances: stt.utterances }, null, 2),
  );
  writeFileSync(join(OUT, `${stt.model}.txt`), stt.text);
  console.log("wrote", join(OUT, `${stt.model}.txt`));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
