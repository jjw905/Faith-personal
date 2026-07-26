/**
 * 전체 화자분리 결과에서 다화자 밀집 구간을 고르고 고정 클립/매니페스트를 만든다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/select-multi-speaker-window.ts
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

type Segment = {
  startSec: number;
  endSec: number;
  speaker: string;
};

type Diarization = {
  model: string;
  durationSec: number;
  segments: Segment[];
};

const ROOT = process.cwd();
const SOURCE = join(
  ROOT,
  ".data/stt-bench/assembly3-envlabor-20250630.mp3",
);
const DIARIZATION = join(
  ROOT,
  ".data/stt-bench/assembly3__local-diarization.json",
);
const FIXTURE_DIR = join(ROOT, ".data/stt-bench/fixtures");
const WINDOW_SEC = Number(process.env.WINDOW_SEC || 180);
const STEP_SEC = Number(process.env.STEP_SEC || 5);
const MIN_SPEAKER_SEC = Number(process.env.MIN_SPEAKER_SEC || 1);
const FIXTURE_ID = `assembly3-dense-${WINDOW_SEC}`;
const CLIP = join(FIXTURE_DIR, `${FIXTURE_ID}.wav`);
const MANIFEST = join(FIXTURE_DIR, `${FIXTURE_ID}.json`);

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function scoreWindow(
  segments: Segment[],
  startSec: number,
  durationSec: number,
) {
  const endSec = startSec + durationSec;
  const clipped = segments
    .filter(
      (segment) =>
        segment.endSec > startSec && segment.startSec < endSec,
    )
    .map((segment) => ({
      ...segment,
      startSec: Math.max(segment.startSec, startSec),
      endSec: Math.min(segment.endSec, endSec),
    }))
    .sort((left, right) => left.startSec - right.startSec);

  const speakerDuration = new Map<string, number>();
  for (const segment of clipped) {
    speakerDuration.set(
      segment.speaker,
      (speakerDuration.get(segment.speaker) ?? 0) +
        (segment.endSec - segment.startSec),
    );
  }
  const speakers = [...speakerDuration.entries()]
    .filter(([, seconds]) => seconds >= MIN_SPEAKER_SEC)
    .map(([speaker]) => speaker);
  const included = new Set(speakers);
  const eligible = clipped.filter((segment) => included.has(segment.speaker));
  const transitionCount = eligible.slice(1).reduce(
    (count, segment, index) =>
      count + Number(eligible[index]!.speaker !== segment.speaker),
    0,
  );
  const speechSec = eligible.reduce(
    (sum, segment) => sum + segment.endSec - segment.startSec,
    0,
  );

  return {
    startSec,
    endSec,
    durationSec,
    speakerCount: speakers.length,
    speakers,
    transitionCount,
    speechSec: Number(speechSec.toFixed(3)),
    speechRatio: Number((speechSec / durationSec).toFixed(6)),
  };
}

function main() {
  const diarization = JSON.parse(
    readFileSync(DIARIZATION, "utf8"),
  ) as Diarization;
  const candidates = [];
  for (
    let startSec = 0;
    startSec + WINDOW_SEC <= diarization.durationSec;
    startSec += STEP_SEC
  ) {
    candidates.push(
      scoreWindow(diarization.segments, startSec, WINDOW_SEC),
    );
  }
  candidates.sort(
    (left, right) =>
      right.speakerCount - left.speakerCount ||
      right.transitionCount - left.transitionCount ||
      right.speechRatio - left.speechRatio ||
      left.startSec - right.startSec,
  );
  const selected = candidates[0];
  if (!selected) throw new Error("선택할 구간이 없습니다.");

  mkdirSync(FIXTURE_DIR, { recursive: true });
  execFileSync(
    "ffmpeg",
    [
      "-nostdin",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(selected.startSec),
      "-t",
      String(WINDOW_SEC),
      "-i",
      SOURCE,
      "-ac",
      "1",
      "-ar",
      "16000",
      CLIP,
    ],
    { stdio: "inherit" },
  );

  const manifest = {
    fixtureId: FIXTURE_ID,
    createdAt: new Date().toISOString(),
    selection: {
      method:
        "전체 로컬 화자분리 결과를 고정 길이 창으로 스캔, 화자 수→전환 수→발화 비율 순",
      windowSec: WINDOW_SEC,
      stepSec: STEP_SEC,
      minSpeakerSec: MIN_SPEAKER_SEC,
      selected,
      topCandidates: candidates.slice(0, 10),
    },
    source: {
      file: basename(SOURCE),
      sha256: sha256(SOURCE),
    },
    diarization: {
      file: basename(DIARIZATION),
      model: diarization.model,
      sha256: sha256(DIARIZATION),
    },
    clip: {
      file: basename(CLIP),
      bytes: statSync(CLIP).size,
      sha256: sha256(CLIP),
      format: "wav, mono, 16000Hz",
    },
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
}

main();
