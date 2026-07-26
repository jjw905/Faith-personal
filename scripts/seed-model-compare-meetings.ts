/**
 * 같은 180초 다화자 클립을 두 STT 모델로 처리해 로컬 사이트 회의로 올린다.
 *
 * - gpt-4o-mini-transcribe: 상품 업로드 경로 그대로(청크 전사 + whisper-1 실측 시각)
 * - faster-whisper large-v3: 로컬 실행 결과(JSON)의 전사, 세그먼트 사용
 *
 * 두 회의 모두 구조화(gpt-4o-mini) → 실측 시각 정렬 → 회의 산출까지 파이프라인을 탄다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/seed-model-compare-meetings.ts
 */
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chunkedTranscribe } from "../src/lib/stt/chunked-transcribe";
import { buildSemanticStructure } from "../src/lib/stt/semantic-structure";
import { alignDialogueToTimedSegments } from "../src/lib/stt/timed-segments";
import type { TimedSegment } from "../src/lib/stt/timed-segments";
import { buildMeetingFromStt } from "../src/lib/stt/to-meeting";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const ROOT = process.cwd();
const FIXTURE_DIR = join(ROOT, ".data/stt-bench/fixtures");
const RUN_DIR = join(ROOT, ".data/stt-bench/multi-speaker-run-20260727");
const MOCKS = join(ROOT, "src/mocks");
const WORK = join(ROOT, ".data/tmp-seed-model-compare");

type Manifest = {
  selection: { selected: { durationSec: number } };
  clip: { file: string };
};

type MeetingsFile = { meetings: Array<Record<string, unknown>> };
type TranscriptsFile = { transcripts: Record<string, unknown> };
type TimelinesFile = { timelines: Record<string, unknown> };

const manifest = JSON.parse(
  readFileSync(join(FIXTURE_DIR, "assembly3-dense-180.json"), "utf8"),
) as Manifest;
const CLIP = join(FIXTURE_DIR, manifest.clip.file);
const durationSec = manifest.selection.selected.durationSec;
/** replayAudio는 .data/stt-bench 기준 상대 경로. */
const REPLAY = `fixtures/${manifest.clip.file}`;

async function sttMini(): Promise<{ text: string; timed: TimedSegment[] }> {
  const res = await chunkedTranscribe({
    audioPath: CLIP,
    workDir: join(WORK, "mini"),
    model: "gpt-4o-mini-transcribe",
  });
  return { text: res.text, timed: res.timedSegments };
}

function sttFasterWhisper(): { text: string; timed: TimedSegment[] } {
  const path = join(RUN_DIR, "upload__faster-whisper-large-v3.json");
  if (!existsSync(path)) {
    throw new Error(
      "faster-whisper 결과 없음. ml/stt/run_faster_whisper_bench.py 먼저 실행",
    );
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    text?: string;
    segments?: TimedSegment[];
  };
  const timed = (raw.segments ?? []).filter((s) => s.text?.trim());
  if (timed.length === 0) throw new Error("faster-whisper 세그먼트 없음");
  return { text: (raw.text || "").trim(), timed };
}

async function buildOne(params: {
  meetingId: string;
  title: string;
  tags: string[];
  text: string;
  timed: TimedSegment[];
}) {
  const { structure } = await buildSemanticStructure(params.text, durationSec);
  structure.dialogue = alignDialogueToTimedSegments(
    structure.dialogue,
    params.timed,
    durationSec,
  );
  if (structure.dialogue.length === 0) {
    throw new Error(`${params.meetingId}: 대화기록 없음`);
  }

  const built = buildMeetingFromStt({
    meetingId: params.meetingId,
    title: params.title,
    durationSec,
    rawText: params.text,
    semantic: structure,
    timedSegments: params.timed,
    workspace: "personal",
    tags: params.tags,
    summaryTags: params.tags.slice(0, 3),
    date: new Date().toISOString(),
    capture: "upload",
  });

  return {
    ...built,
    meeting: { ...built.meeting, replayAudio: REPLAY },
  };
}

function writeMocks(
  built: Array<Awaited<ReturnType<typeof buildOne>>>,
) {
  const meetingsPath = join(MOCKS, "meetings.json");
  const transcriptsPath = join(MOCKS, "meeting-transcripts.json");
  const timelinesPath = join(MOCKS, "meeting-timelines.json");

  const meetings = JSON.parse(
    readFileSync(meetingsPath, "utf8"),
  ) as MeetingsFile;
  const transcripts = JSON.parse(
    readFileSync(transcriptsPath, "utf8"),
  ) as TranscriptsFile;
  const timelines = JSON.parse(
    readFileSync(timelinesPath, "utf8"),
  ) as TimelinesFile;

  const ids = new Set(built.map((b) => b.meeting.id));
  meetings.meetings = [
    ...built.map((b) => b.meeting as unknown as Record<string, unknown>),
    ...meetings.meetings.filter((m) => !ids.has(String(m.id))),
  ];
  for (const b of built) {
    transcripts.transcripts[b.meeting.id] = b.transcript;
    timelines.timelines[b.meeting.id] = b.timeline;
  }

  writeFileSync(meetingsPath, `${JSON.stringify(meetings, null, 2)}\n`);
  writeFileSync(transcriptsPath, `${JSON.stringify(transcripts, null, 2)}\n`);
  writeFileSync(timelinesPath, `${JSON.stringify(timelines, null, 2)}\n`);
}

async function main() {
  mkdirSync(WORK, { recursive: true });
  try {
    const faster = sttFasterWhisper();
    console.log(
      `faster-whisper: ${faster.text.length}자, 세그먼트 ${faster.timed.length}개`,
    );
    const mini = await sttMini();
    console.log(
      `mini: ${mini.text.length}자, 실측 세그먼트 ${mini.timed.length}개`,
    );

    const built = [
      await buildOne({
        meetingId: "mtg-cmp-mini",
        title: "다화자 180초, gpt-4o-mini-transcribe",
        tags: ["모델비교", "mini", "업로드"],
        text: mini.text,
        timed: mini.timed,
      }),
      await buildOne({
        meetingId: "mtg-cmp-faster",
        title: "다화자 180초, faster-whisper large-v3",
        tags: ["모델비교", "faster-whisper", "업로드"],
        text: faster.text,
        timed: faster.timed,
      }),
    ];

    writeMocks(built);

    for (const b of built) {
      const first = b.transcript.lines[0];
      const last = b.transcript.lines.at(-1);
      console.log(
        `${b.meeting.id}: 줄 ${b.transcript.lines.length}개, 구간 ${b.timeline.segments.length}개, ${first?.time}~${last?.time}`,
      );
    }
  } finally {
    rmSync(WORK, { recursive: true, force: true });
  }
}

void main();
