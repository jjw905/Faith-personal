/**
 * 업로드 시점 오디오 정규화 확인.
 *
 * server-only 모듈을 쓰므로 react-server 조건으로 실행한다.
 * NODE_OPTIONS="--conditions=react-server" npx tsx --tsconfig tsconfig.json \
 *   scripts/test-playback-normalize.ts [파일]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { normalizeAudioForPlayback } from "../src/lib/storage/playback-audio";
import { requireAudioToolPath } from "../src/lib/stt/local-tools";
import { needsPlaybackNormalize } from "../src/lib/vault";

const SOURCE =
  process.argv[2] ?? ".data/stt-bench/ktv-briefing-20251231.mp3";

function probe(path: string, entries: string): string {
  return execFileSync(
    requireAudioToolPath("ffprobe"),
    [
      "-v",
      "error",
      "-show_entries",
      entries,
      "-of",
      "default=noprint_wrappers=1",
      path,
    ],
    { encoding: "utf8" },
  ).trim();
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function main() {
  const fileName = SOURCE.slice(SOURCE.lastIndexOf("/") + 1);
  const body = readFileSync(SOURCE);
  console.log(`입력 ${fileName} · ${mb(body.length)}`);
  console.log(`정규화 대상인가: ${needsPlaybackNormalize(fileName)}`);
  console.log(`원본: ${probe(SOURCE, "format=format_name,duration,bit_rate").replace(/\n/g, " / ")}`);

  const started = Date.now();
  const out = normalizeAudioForPlayback(body, fileName);
  const wallMs = Date.now() - started;

  if (!out) {
    console.log("변환 안 함 (원본 유지)");
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "faith-normalize-check-"));
  const path = join(dir, out.fileName);
  try {
    writeFileSync(path, out.body);
    console.log(
      `\n출력 ${out.fileName} · ${mb(out.body.length)} · ${out.mime} · ${(wallMs / 1000).toFixed(1)}초 소요`,
    );
    console.log(`  ${probe(path, "format=format_name,duration,bit_rate").replace(/\n/g, " / ")}`);
    console.log(`  ${probe(path, "stream=codec_name,sample_rate,channels").replace(/\n/g, " / ")}`);

    const saved = 1 - out.body.length / body.length;
    console.log(
      `\n용량 ${saved >= 0 ? "감소" : "증가"} ${Math.abs(saved * 100).toFixed(0)}%`,
    );

    // MP4 샘플 표가 있어야 브라우저가 정확히 seek한다.
    const head = out.body.subarray(0, 4096).toString("latin1");
    const boxes = ["moov", "stts", "stsz", "stco", "co64"].filter((box) =>
      head.includes(box),
    );
    console.log(`앞부분 4KB 안의 MP4 박스: ${boxes.join(", ") || "없음"}`);
    console.log(
      boxes.includes("moov") && (boxes.includes("stsz") || boxes.includes("stts"))
        ? "→ 샘플 표가 파일 앞에 있다. 받자마자 정확한 seek 가능."
        : "→ 샘플 표를 앞에서 못 찾았다. faststart 확인 필요.",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main();
