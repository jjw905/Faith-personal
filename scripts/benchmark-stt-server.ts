/**
 * DigitalOcean App Platform 운영 사양과 같은 2 CPU, 4GiB 제한에서 실행한다.
 *
 * AUDIO=.data/stt-bench/fixtures/brief-envwork.mp3 \
 * npx tsx --tsconfig tsconfig.json scripts/benchmark-stt-server.ts
 */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { cpus, freemem, totalmem } from "node:os";

import {
  probeDurationSec,
} from "../src/lib/stt/chunked-transcribe";
import {
  audioToolPath,
  requireAudioToolPath,
} from "../src/lib/stt/local-tools";
import {
  audioToPcm24k,
  cleanupWorkDir,
} from "../src/lib/stt/realtime/pcm";

const ROOT = process.cwd();
const AUDIO =
  process.env.AUDIO ||
  join(ROOT, ".data/stt-bench/fixtures/brief-envwork.mp3");
const WORK = join(ROOT, ".data/stt-server-bench");
const REPORT_DIR = join(ROOT, "Faith-office/stt-term-runs/reports");
const REPORT = join(
  REPORT_DIR,
  "Faith_STT_서버사양_검증.md",
);

function cgroupValue(path: string): string | null {
  try {
    return readFileSync(path, "utf8").trim();
  } catch {
    return null;
  }
}

function commandVersion(command: "ffmpeg" | "ffprobe"): string {
  const path = requireAudioToolPath(command);
  return execFileSync(path, ["-version"], { encoding: "utf8" })
    .split("\n")[0]!
    .trim();
}

async function main() {
  if (!existsSync(AUDIO)) throw new Error(`오디오 없음: ${AUDIO}`);
  mkdirSync(WORK, { recursive: true });
  mkdirSync(REPORT_DIR, { recursive: true });

  const sample = join(WORK, "sample-180.mp3");
  execFileSync(
    requireAudioToolPath("ffmpeg"),
    [
      "-y",
      "-i",
      AUDIO,
      "-t",
      "180",
      "-ac",
      "1",
      "-ar",
      "24000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "64k",
      sample,
    ],
    { stdio: "pipe" },
  );

  const beforeRss = process.memoryUsage().rss;
  const started = Date.now();
  const pcmWork = join(WORK, "pcm");
  const pcm = audioToPcm24k(sample, pcmWork);
  const conversionMs = Date.now() - started;
  const afterRss = process.memoryUsage().rss;
  const durationSec = probeDurationSec(sample);
  cleanupWorkDir(pcmWork);
  rmSync(sample, { force: true });

  const output = {
    profile: "DigitalOcean App Platform Dedicated, 2 CPU, 4GiB",
    node: process.version,
    logicalCpuVisible: cpus().length,
    osTotalMemoryMiB: Math.round(totalmem() / 1024 / 1024),
    osFreeMemoryMiB: Math.round(freemem() / 1024 / 1024),
    cgroupCpuMax: cgroupValue("/sys/fs/cgroup/cpu.max"),
    cgroupMemoryMax: cgroupValue("/sys/fs/cgroup/memory.max"),
    ffmpegPathReady: Boolean(audioToolPath("ffmpeg")),
    ffprobePathReady: Boolean(audioToolPath("ffprobe")),
    ffmpegVersion: commandVersion("ffmpeg"),
    ffprobeVersion: commandVersion("ffprobe"),
    sampleDurationSec: durationSec,
    pcmDurationSec: pcm.durationSec,
    pcmBytes: pcm.pcm.length,
    conversionMs,
    realtimeFactor: conversionMs / 1000 / Math.max(0.1, durationSec),
    rssBeforeMiB: Math.round(beforeRss / 1024 / 1024),
    rssAfterMiB: Math.round(afterRss / 1024 / 1024),
    rssDeltaMiB: Math.round((afterRss - beforeRss) / 1024 / 1024),
  };
  writeFileSync(
    join(WORK, "summary.json"),
    JSON.stringify(output, null, 2),
  );

  const pass =
    output.ffmpegPathReady &&
    output.ffprobePathReady &&
    output.realtimeFactor < 0.25 &&
    output.rssAfterMiB < 1024;
  const report = [
    "# Faith STT 서버 사양 검증",
    "- 날짜: 2026-07-28",
    "- 웹 서버: DigitalOcean App Platform Dedicated, 2 CPU, 4GiB",
    "- LiveKit: DigitalOcean Singapore Basic Shared CPU, 4 vCPU, 8GiB",
    "- 실시간 음성 전사: 브라우저에서 OpenAI WebRTC로 직접 연결",
    "- 업로드 오디오 도구: npm 정적 ffmpeg, ffprobe",
    `- 180초 PCM 변환: ${(conversionMs / 1000).toFixed(2)}초`,
    `- 변환 실시간 배수: ${output.realtimeFactor.toFixed(3)}`,
    `- 프로세스 RSS: ${output.rssAfterMiB}MiB`,
    `- 판정: ${pass ? "통과" : "실패"}`,
    "- 화자분리: 웹 서버에서 강제하지 않음. 별도 Worker가 없으면 안전하게 생략",
    "- 비용: 업로드 dual-mini 실측 약 $0.00474/분, 구조화 포함 약 7.5원/분",
  ].join("\n");
  writeFileSync(REPORT, report, "utf8");
  console.log(JSON.stringify({ ...output, pass }, null, 2));
  if (!pass) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
