/**
 * .data/stt-bench diarize 결과를 meetings mock에 주입.
 * 화자명은 AI 라벨만 사용. 시각은 실측만(추정 금지).
 *
 * 우선순위:
 * 1) *__diarized.json (API start/end)
 * 2) timed-segments.json 에 화자 라인 정렬
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import {
  buildMeetingFromDiarize,
  parseDiarizedApiSegments,
  parseDiarizedText,
  type DiarizeSegment,
} from "../src/lib/diarize-meeting";
import {
  alignDialogueToTimedSegments,
  type TimedSegment,
} from "../src/lib/stt/timed-segments";

const ROOT = join(__dirname, "..");
const BENCH = join(ROOT, ".data/stt-bench");
const MOCKS = join(ROOT, "src/mocks");

type MeetingsFile = { meetings: Array<Record<string, unknown>> };
type TranscriptsFile = {
  transcripts: Record<string, Record<string, unknown>>;
};
type TimelinesFile = {
  timelines: Record<string, Record<string, unknown>>;
};

const SAMPLES = [
  {
    meetingId: "mtg-stt-assembly",
    title: "제424회 국회 환노위 (STT 화자분리)",
    tags: ["STT", "국회", "화자분리"],
    summaryTags: ["AI", "diarize", "환노위"],
    daysAgo: 0,
    time: "11:33:00",
    durationSec: 18 * 60 + 34,
    diarized: "assembly__gpt-4o-transcribe-diarize__diarized.txt",
    diarizedJson: "assembly__gpt-4o-transcribe-diarize__diarized.json",
    timed: "assembly__timed-segments.json",
    replayAudio: "assembly-envlabor-20250425.mp3",
    overallSummary:
      "gpt-4o-transcribe-diarize가 구분한 화자 라벨 기준 국회 환노위 녹취.",
  },
  {
    meetingId: "mtg-stt-ktv",
    title: "KTV 브리핑 (STT 화자분리)",
    tags: ["STT", "KTV", "화자분리"],
    summaryTags: ["AI", "diarize", "브리핑"],
    daysAgo: 0,
    time: "14:00:00",
    durationSec: Math.round(11.74 * 60),
    diarized: "ktv__gpt-4o-transcribe-diarize__diarized.txt",
    diarizedJson: "ktv__gpt-4o-transcribe-diarize__diarized.json",
    timed: "ktv__timed-segments.json",
    replayAudio: "ktv-briefing-20251231.mp3",
    overallSummary:
      "gpt-4o-transcribe-diarize가 구분한 화자 라벨 기준 KTV 브리핑 녹취.",
  },
] as const;

function loadTimedSegments(file: string): TimedSegment[] {
  const path = join(BENCH, file);
  if (!existsSync(path)) {
    throw new Error(
      `timed segments 없음: ${file} (npm run seed:stt-bench 또는 extract-timed-segments.py)`,
    );
  }
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    durationSec?: number;
    segments?: TimedSegment[];
  };
  return (raw.segments ?? []).filter(
    (s) =>
      typeof s.startSec === "number" &&
      typeof s.endSec === "number" &&
      Boolean(s.text?.trim()),
  );
}

function loadApiTimedSegments(file: string): DiarizeSegment[] | null {
  const path = join(BENCH, file);
  if (!existsSync(path)) return null;
  const raw = JSON.parse(readFileSync(path, "utf8")) as {
    segments?: Array<{
      speaker?: string;
      text?: string;
      start?: number;
      end?: number;
    }>;
    parsedSegments?: DiarizeSegment[];
  };
  if (Array.isArray(raw.parsedSegments) && raw.parsedSegments.length > 0) {
    const ok = raw.parsedSegments.every(
      (s) => typeof s.startSec === "number" && typeof s.endSec === "number",
    );
    if (ok) return raw.parsedSegments;
  }
  if (!Array.isArray(raw.segments) || raw.segments.length === 0) return null;
  const parsed = parseDiarizedApiSegments(raw.segments);
  const ok = parsed.every(
    (s) => typeof s.startSec === "number" && typeof s.endSec === "number",
  );
  return ok ? parsed : null;
}

function withAlignedTimes(
  segments: DiarizeSegment[],
  timed: TimedSegment[],
  durationSec: number,
): DiarizeSegment[] {
  const dialogue = segments.map((s) => ({
    speaker: s.speaker,
    text: s.text,
    startSec: 0,
  }));
  const aligned = alignDialogueToTimedSegments(dialogue, timed, durationSec);
  return aligned.map((d, i) => {
    const startSec = d.startSec;
    const endSec =
      i + 1 < aligned.length
        ? Math.max(startSec, aligned[i + 1]!.startSec)
        : durationSec;
    return {
      speaker: d.speaker || segments[i]!.speaker,
      text: d.text,
      startSec,
      endSec,
    };
  });
}

function resolveSegments(sample: (typeof SAMPLES)[number]): {
  segments: DiarizeSegment[];
  durationSec: number;
  source: string;
} {
  const fromApi = loadApiTimedSegments(sample.diarizedJson);
  if (fromApi && fromApi.length > 0) {
    const lastEnd = Math.max(
      ...fromApi.map((s) => s.endSec ?? 0),
      sample.durationSec,
    );
    return {
      segments: fromApi,
      durationSec: lastEnd,
      source: sample.diarizedJson,
    };
  }

  const rawPath = join(BENCH, sample.diarized);
  if (!existsSync(rawPath)) {
    throw new Error(`diarized txt 없음: ${sample.diarized}`);
  }
  const parsed = parseDiarizedText(readFileSync(rawPath, "utf8"));
  if (parsed.length === 0) {
    throw new Error(`no segments: ${sample.diarized}`);
  }

  const alreadyTimed = parsed.every(
    (s) => typeof s.startSec === "number" && typeof s.endSec === "number",
  );
  if (alreadyTimed) {
    const lastEnd = Math.max(
      ...parsed.map((s) => s.endSec ?? 0),
      sample.durationSec,
    );
    return {
      segments: parsed,
      durationSec: lastEnd,
      source: `${sample.diarized}(embedded times)`,
    };
  }

  const timed = loadTimedSegments(sample.timed);
  if (timed.length === 0) {
    throw new Error(`timed segments 비어 있음: ${sample.timed}`);
  }
  const durationSec = Math.max(
    sample.durationSec,
    timed[timed.length - 1]!.endSec,
  );
  return {
    segments: withAlignedTimes(parsed, timed, durationSec),
    durationSec,
    source: `${sample.diarized}+${sample.timed}`,
  };
}

function main() {
  const built = SAMPLES.map((sample) => {
    const { segments, durationSec, source } = resolveSegments(sample);
    console.log(`${sample.meetingId}: source=${source} lines=${segments.length}`);

    return buildMeetingFromDiarize({
      meetingId: sample.meetingId,
      title: sample.title,
      tags: [...sample.tags],
      summaryTags: [...sample.summaryTags],
      daysAgo: sample.daysAgo,
      time: sample.time,
      durationSec,
      workspace: "personal",
      segments,
      overallSummary: sample.overallSummary,
      replayAudio: sample.replayAudio,
      allowEstimateTimes: false,
    });
  });

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
  meetings.meetings = meetings.meetings.filter((m) => !ids.has(String(m.id)));
  meetings.meetings = [
    ...built.map((b) => b.meeting as unknown as Record<string, unknown>),
    ...meetings.meetings,
  ];

  for (const b of built) {
    const id = b.meeting.id;
    transcripts.transcripts[id] = b.transcript as unknown as Record<
      string,
      unknown
    >;
    timelines.timelines[id] = b.timeline as unknown as Record<string, unknown>;
  }

  writeFileSync(meetingsPath, `${JSON.stringify(meetings, null, 2)}\n`);
  writeFileSync(transcriptsPath, `${JSON.stringify(transcripts, null, 2)}\n`);
  writeFileSync(timelinesPath, `${JSON.stringify(timelines, null, 2)}\n`);

  for (const b of built) {
    const speakers = b.meeting.participants.map((p) => p.name).join(", ");
    const first = b.transcript.lines[0]?.time;
    const last = b.transcript.lines.at(-1)?.time;
    console.log(
      `${b.meeting.id}: lines=${b.transcript.lines.length} speakers=[${speakers}] time=${first}..${last}`,
    );
  }
}

main();
