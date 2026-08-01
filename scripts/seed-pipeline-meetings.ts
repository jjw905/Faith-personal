/**
 * 로컬 목업 회의를 상품 업로드 파이프라인 그대로 다시 만든다.
 *
 * 기존 목업은 gpt-4o-transcribe-diarize 결과를 바로 꽂아 넣은 것이라
 * 구간 제목이 '구간 2' 같은 껍데기였고 화자도 라벨뿐이었다.
 * 여기서는 실제 경로를 탄다:
 *   본전사(캐시) + 실측 시각(캐시) + 로컬 화자분리
 *   → 화자 붙이기 → 구조화 → 시각 정렬 → 화자 실명 → 보정 추천
 *
 * 화자분리는 오래 걸려서 결과를 캐시한다. 지우면 다시 돈다.
 *
 * npx tsx scripts/seed-pipeline-meetings.ts
 */
import { config } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env" });
config({ path: ".env.local", override: true });

import {
  diarizeAudio,
  prunePhantomSpeakers,
  type DiarizationResult,
} from "../src/lib/stt/diarization";
import { chunkedTranscribe } from "../src/lib/stt/chunked-transcribe";
import { buildGlossary } from "../src/lib/stt/glossary";
import { buildSemanticStructure } from "../src/lib/stt/semantic-structure";
import {
  attachSpeakersToText,
  formatSpeakerBlocks,
} from "../src/lib/stt/speaker-attach";
import {
  applySpeakerNames,
  identifySpeakerNames,
} from "../src/lib/stt/speaker-names";
import {
  attachCorrections,
  suggestTermCorrections,
} from "../src/lib/stt/term-suggest";
import { alignDialogueToTimedSegments } from "../src/lib/stt/timed-segments";
import type { TimedSegment } from "../src/lib/stt/timed-segments";
import { buildMeetingFromStt } from "../src/lib/stt/to-meeting";

const ROOT = process.cwd();
const BENCH = join(ROOT, ".data/stt-bench");
const MOCKS = join(ROOT, "src/mocks");

type Sample = {
  meetingId: string;
  title: string;
  tags: string[];
  time: string;
  audio: string;
  text: string;
  timed: string;
  diarCache: string;
};

const SAMPLES: Sample[] = [
  {
    meetingId: "mtg-stt-assembly",
    title: "제424회 국회 환경노동위원회",
    tags: ["국회", "환노위", "추경"],
    time: "11:33:00",
    audio: "assembly-envlabor-20250425.mp3",
    text: "assembly__gpt-4o-mini-transcribe__chunked-silencecut.txt",
    timed: "assembly__timed-segments.json",
    diarCache: "assembly__local-diarization.json",
  },
  {
    meetingId: "mtg-stt-ktv",
    title: "KTV 정책 브리핑",
    tags: ["브리핑", "정책"],
    time: "14:00:00",
    audio: "ktv-briefing-20251231.mp3",
    text: "ktv__gpt-4o-mini-transcribe__corrected.txt",
    timed: "ktv__timed-segments.json",
    diarCache: "ktv__local-diarization.json",
  },
];

type MeetingsFile = { meetings: Array<Record<string, unknown>> };
type TranscriptsFile = { transcripts: Record<string, unknown> };
type TimelinesFile = { timelines: Record<string, unknown> };

function loadTimed(file: string): TimedSegment[] {
  const raw = JSON.parse(readFileSync(join(BENCH, file), "utf8")) as {
    segments?: TimedSegment[];
  };
  return (raw.segments ?? []).filter((s) => Boolean(s.text?.trim()));
}

async function loadDiarization(sample: Sample): Promise<DiarizationResult> {
  const path = join(BENCH, sample.diarCache);
  if (existsSync(path)) {
    // 캐시는 모델 원본이라 여기서도 유령 화자를 걸러야 한다.
    const raw = JSON.parse(readFileSync(path, "utf8")) as DiarizationResult;
    const pruned = prunePhantomSpeakers(raw);
    console.log(
      `  화자분리 캐시: ${raw.speakerCount}명 → ${pruned.speakerCount}명`,
    );
    return pruned;
  }
  console.log("  화자분리 실행 (몇 분 걸림)...");
  const started = Date.now();
  const result = await diarizeAudio({ audioPath: join(BENCH, sample.audio) });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `  화자 ${result.speakerCount}명, ${((Date.now() - started) / 1000).toFixed(0)}초`,
  );
  return result;
}

/** 직전 회의에서 확인된 참석자. 제품에서는 회의 정보에 이미 들어 있다. */
function knownParticipants(meetingId: string): string[] {
  try {
    const file = JSON.parse(
      readFileSync(join(MOCKS, "meetings.json"), "utf8"),
    ) as { meetings: Array<{ id: string; participants?: Array<{ name: string }> }> };
    const row = file.meetings.find((m) => m.id === meetingId);
    return (row?.participants ?? []).map((p) => p.name);
  } catch {
    return [];
  }
}

function dateFor(time: string): string {
  const now = new Date();
  const [h, m, s] = time.split(":").map(Number);
  now.setHours(h ?? 0, m ?? 0, s ?? 0, 0);
  return now.toISOString();
}

/**
 * 용어를 미리 알려 준 전사.
 *
 * 제품에서는 참석자 목록과 지난 회의 보정 이력에서 용어가 모인다.
 * 여기서도 같은 자리에서만 긁어 온다. 손으로 정답을 넣지 않는다.
 * 다시 전사하는 값이 비싸서 결과를 캐시한다. 지우면 다시 돈다.
 */
async function transcribeWithGlossary(
  sample: Sample,
  glossary: string[],
): Promise<string | null> {
  const cachePath = join(BENCH, `${sample.meetingId}__glossary-transcript.txt`);
  if (existsSync(cachePath)) {
    console.log("  용어 주입 전사: 캐시");
    return readFileSync(cachePath, "utf8").trim();
  }
  const audioPath = join(BENCH, sample.audio);
  if (!existsSync(audioPath) || glossary.length === 0) return null;

  console.log(`  용어 주입 전사 실행 (${glossary.length}개, 몇 분 걸림)...`);
  const out = await chunkedTranscribe({
    audioPath,
    workDir: join(BENCH, "tmp", sample.meetingId),
    model: "gpt-4o-mini-transcribe",
    glossary,
  });
  writeFileSync(cachePath, `${out.text}\n`);
  console.log(`  용어 주입 전사 $${out.usage.estimatedUsd.toFixed(4)}`);
  return out.text.trim();
}

async function buildOne(sample: Sample) {
  console.log(`\n== ${sample.meetingId}`);
  const baseText = readFileSync(join(BENCH, sample.text), "utf8").trim();

  const glossary = await buildGlossary({
    title: sample.title,
    participantNames: knownParticipants(sample.meetingId),
  });
  console.log(
    `  용어 ${glossary.length}개${glossary.length ? `: ${glossary.join(", ")}` : ""}`,
  );
  const text = (await transcribeWithGlossary(sample, glossary)) ?? baseText;

  const timedSegments = loadTimed(sample.timed);
  if (timedSegments.length === 0) {
    throw new Error(`실측 시각 없음: ${sample.timed}`);
  }
  const durationSec = timedSegments.at(-1)!.endSec;
  const diarization = await loadDiarization(sample);

  const blocks = attachSpeakersToText({
    text,
    timedSegments,
    diarization,
    durationSec,
  });
  const structureInput =
    blocks.length > 0 ? formatSpeakerBlocks(blocks) : text;

  const { structure, usage, dialogueCoverage } = await buildSemanticStructure(
    structureInput,
    durationSec,
  );
  console.log(
    `  구조화 $${usage.estimatedUsd.toFixed(4)}, 대화 보존 ${(dialogueCoverage * 100).toFixed(0)}%`,
  );

  structure.dialogue = alignDialogueToTimedSegments(
    structure.dialogue,
    timedSegments,
    durationSec,
  );

  const named = await identifySpeakerNames({ dialogue: structure.dialogue });
  applySpeakerNames(structure, named.guesses);
  console.log(
    `  화자 실명 ${named.guesses.length}건: ${named.guesses.map((g) => `${g.label}→${g.name}`).join(", ") || "없음"}`,
  );

  const built = buildMeetingFromStt({
    meetingId: sample.meetingId,
    title: sample.title,
    durationSec,
    rawText: text,
    semantic: structure,
    timedSegments,
    tags: sample.tags,
    date: dateFor(sample.time),
    capture: "upload",
  });

  const suggested = await suggestTermCorrections(
    built.transcript.lines.map((l) => l.text ?? ""),
    { keepTerms: named.guesses.map((g) => g.name) },
  );
  built.transcript.lines = attachCorrections(
    built.transcript.lines,
    suggested.suggestions,
  );
  const llmUsd =
    usage.estimatedUsd + named.usage.estimatedUsd + suggested.usage.estimatedUsd;
  console.log(
    `  보정 추천 ${suggested.suggestions.length}건 $${suggested.usage.estimatedUsd.toFixed(4)}`,
  );
  console.log(
    `  후처리 합계 $${llmUsd.toFixed(4)} (분당 $${(llmUsd / (durationSec / 60)).toFixed(5)})`,
  );

  // 목업은 번들된 샘플 음성을 그대로 재생한다.
  (built.meeting as unknown as Record<string, unknown>).replayAudio =
    sample.audio;

  const kinds = new Map<string, number>();
  for (const seg of built.timeline.segments) {
    kinds.set(seg.kind, (kinds.get(seg.kind) ?? 0) + 1);
  }
  console.log(
    `  구간 ${built.timeline.segments.length}개 (${[...kinds].map(([k, v]) => `${k} ${v}`).join(", ")})`,
  );
  console.log(`  제목: ${built.timeline.segments.map((s) => s.title).join(" / ")}`);
  console.log(
    `  참석자: ${built.meeting.participants.map((p) => p.name).join(", ")}`,
  );
  return built;
}

async function main() {
  const only = process.argv[2];
  const targets = only
    ? SAMPLES.filter((s) => s.meetingId.includes(only))
    : SAMPLES;
  const built = [];
  for (const sample of targets) {
    built.push(await buildOne(sample));
  }

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
  console.log("\n목업 갱신 완료");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
