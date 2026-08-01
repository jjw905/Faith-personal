/**
 * 업로드 정규화를 형식별로 확인한다.
 *
 * 먼저 .data/fmt/ 에 60초 샘플을 만들어 둔다(mp3, wav, ogg, flac, webm, m4a).
 * NODE_OPTIONS="--conditions=react-server" npx tsx --tsconfig tsconfig.json \
 *   scripts/test-playback-normalize-formats.ts
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeAudioForPlayback } from "../src/lib/storage/playback-audio";
import { requireAudioToolPath } from "../src/lib/stt/local-tools";
import { needsPlaybackNormalize } from "../src/lib/vault";

const FILES = [
  "sample.mp3",
  "sample.wav",
  "sample.ogg",
  "sample.flac",
  "sample.webm",
  "sample.m4a",
];

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function duration(path: string): number {
  return Number(
    execFileSync(
      requireAudioToolPath("ffprobe"),
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path],
      { encoding: "utf8" },
    ).trim(),
  );
}

function main() {
  console.log("60초 클립 기준\n");
  console.log(
    ["형식".padEnd(7), "원본".padEnd(9), "변환".padEnd(9), "변화".padEnd(7), "시간".padEnd(7), "seek 표"].join(" "),
  );
  for (const name of FILES) {
    const path = `.data/fmt/${name}`;
    const body = readFileSync(path);
    const started = Date.now();
    const out = normalizeAudioForPlayback(body, name);
    const sec = (Date.now() - started) / 1000;

    if (!out) {
      const why = needsPlaybackNormalize(name) ? "변환 실패" : "대상 아님(이미 MP4)";
      console.log([name.padEnd(7), mb(body.length).padEnd(9), why].join(" "));
      continue;
    }

    const dir = mkdtempSync(join(tmpdir(), "faith-fmt-"));
    try {
      const outPath = join(dir, out.fileName);
      writeFileSync(outPath, out.body);
      const change = (1 - out.body.length / body.length) * 100;
      const head = out.body.subarray(0, 4096).toString("latin1");
      const drift = Math.abs(duration(outPath) - duration(path));
      console.log(
        [
          name.padEnd(7),
          mb(body.length).padEnd(9),
          mb(out.body.length).padEnd(9),
          `${change >= 0 ? "-" : "+"}${Math.abs(change).toFixed(0)}%`.padEnd(7),
          `${sec.toFixed(1)}초`.padEnd(7),
          head.includes("moov") ? `앞쪽 (길이차 ${drift.toFixed(2)}초)` : "뒤쪽 — 확인 필요",
        ].join(" "),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

main();
