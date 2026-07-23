/**
 * .data/stt-bench diarize 결과를 meetings mock에 주입.
 * 화자명은 AI 라벨만 사용 (src/lib/diarize-meeting.ts).
 */
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

import {
  buildMeetingFromDiarize,
  parseDiarizedText,
} from "../src/lib/diarize-meeting";

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
    overallSummary:
      "gpt-4o-transcribe-diarize가 구분한 화자 라벨 기준 KTV 브리핑 녹취.",
  },
] as const;

function main() {
  const built = SAMPLES.map((sample) => {
    const raw = readFileSync(join(BENCH, sample.diarized), "utf8");
    const segments = parseDiarizedText(raw);
    if (segments.length === 0) {
      throw new Error(`no segments: ${sample.diarized}`);
    }
    return buildMeetingFromDiarize({
      meetingId: sample.meetingId,
      title: sample.title,
      tags: [...sample.tags],
      summaryTags: [...sample.summaryTags],
      daysAgo: sample.daysAgo,
      time: sample.time,
      durationSec: sample.durationSec,
      workspace: "personal",
      segments,
      overallSummary: sample.overallSummary,
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
    console.log(
      `${b.meeting.id}: lines=${b.transcript.lines.length} speakers=[${speakers}]`,
    );
  }
}

main();
