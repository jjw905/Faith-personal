import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { requireAudioToolPath } from "@/lib/stt/local-tools";

/** 오디오 → 24kHz mono PCM s16le */
export function audioToPcm24k(audioPath: string, workDir: string): {
  pcmPath: string;
  durationSec: number;
  pcm: Buffer;
} {
  if (!existsSync(audioPath)) {
    throw new Error(`오디오 없음: ${audioPath}`);
  }
  mkdirSync(workDir, { recursive: true });
  const pcmPath = join(workDir, `${randomUUID()}.pcm`);
  execFileSync(
    requireAudioToolPath("ffmpeg"),
    [
      "-y",
      "-i",
      audioPath,
      "-ac",
      "1",
      "-ar",
      "24000",
      "-f",
      "s16le",
      "-acodec",
      "pcm_s16le",
      pcmPath,
    ],
    { stdio: "pipe" },
  );
  const pcm = readFileSync(pcmPath);
  const durationSec = pcm.length / (24000 * 2);
  return { pcmPath, durationSec, pcm };
}

export function cleanupWorkDir(workDir: string) {
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

/** PCM을 chunkSec 단위로 자른다. */
export function* iterPcmChunks(
  pcm: Buffer,
  chunkSec = 0.1,
): Generator<{ bytes: Buffer; startSec: number; endSec: number }> {
  const bytesPerSec = 24000 * 2;
  const chunkBytes = Math.max(2, Math.floor(chunkSec * bytesPerSec));
  // even sample alignment
  const aligned = chunkBytes - (chunkBytes % 2);
  let offset = 0;
  let startSec = 0;
  while (offset < pcm.length) {
    const end = Math.min(pcm.length, offset + aligned);
    const slice = pcm.subarray(offset, end - ((end - offset) % 2));
    const endSec = startSec + slice.length / bytesPerSec;
    yield { bytes: Buffer.from(slice), startSec, endSec };
    offset = end;
    startSec = endSec;
  }
}
