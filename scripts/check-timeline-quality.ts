/**
 * 업로드 회의의 타임라인 품질 점검.
 *
 * 캐시해 둔 본전사와 실측 시각을 쓰고, 화자분리만 새로 돌린다.
 * 구간 제목이 알맹이가 있는지, 종류가 한쪽으로 몰리지 않는지,
 * 화자가 '발화' 하나로 뭉개지지 않는지 본다.
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

config({ path: ".env.local" });
config();

import { diarizeAudio } from "../src/lib/stt/diarization";
import { buildSemanticStructure } from "../src/lib/stt/semantic-structure";
import {
  attachSpeakersToText,
  formatSpeakerBlocks,
} from "../src/lib/stt/speaker-attach";
import {
  applySpeakerNames,
  identifySpeakerNames,
} from "../src/lib/stt/speaker-names";
import { alignDialogueToTimedSegments } from "../src/lib/stt/timed-segments";
import type { TimedSegment } from "../src/lib/stt/timed-segments";
import { buildMeetingFromStt } from "../src/lib/stt/to-meeting";

const BENCH = join(__dirname, "..", ".data/stt-bench");
const AUDIO = join(BENCH, "assembly-envlabor-20250425.mp3");
const TEXT = join(BENCH, "assembly__gpt-4o-mini-transcribe__chunked-silencecut.txt");
const TIMED = join(BENCH, "assembly__timed-segments.json");

async function main() {
  const text = readFileSync(TEXT, "utf8").trim();
  const timedSegments = (
    JSON.parse(readFileSync(TIMED, "utf8")) as { segments: TimedSegment[] }
  ).segments.filter((s) => s.text?.trim());
  const durationSec = timedSegments.at(-1)!.endSec;

  console.log(
    `본전사 ${text.length}자, 실측 ${timedSegments.length}구간, ${(durationSec / 60).toFixed(1)}분\n`,
  );

  console.log("화자분리 실행...");
  const t0 = Date.now();
  const diarization = await diarizeAudio({ audioPath: AUDIO });
  const diarMs = Date.now() - t0;
  console.log(
    `  화자 ${diarization.speakerCount}명, 구간 ${diarization.segments.length}개, ` +
      `${(diarMs / 1000).toFixed(1)}초 (실시간 대비 ${(durationSec / (diarMs / 1000)).toFixed(1)}배속)\n`,
  );

  const blocks = attachSpeakersToText({
    text,
    timedSegments,
    diarization,
    durationSec,
  });
  const perSpeaker = new Map<string, number>();
  for (const b of blocks) {
    perSpeaker.set(b.speaker, (perSpeaker.get(b.speaker) ?? 0) + b.text.length);
  }
  console.log(`화자 블록 ${blocks.length}개`);
  for (const [name, chars] of [...perSpeaker].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${chars}자 (${((chars / text.length) * 100).toFixed(0)}%)`);
  }

  const structureInput = formatSpeakerBlocks(blocks);
  console.log(`\n구조화 입력 ${structureInput.length}자. 호출 중...`);
  const t1 = Date.now();
  const { structure, usage, dialogueCoverage } = await buildSemanticStructure(
    structureInput,
    durationSec,
  );
  console.log(
    `  ${((Date.now() - t1) / 1000).toFixed(1)}초, ${usage.totalTokens}토큰, $${usage.estimatedUsd.toFixed(4)}, ` +
      `대화 보존 ${(dialogueCoverage * 100).toFixed(0)}%`,
  );

  structure.dialogue = alignDialogueToTimedSegments(
    structure.dialogue,
    timedSegments,
    durationSec,
  );

  const named = await identifySpeakerNames({ dialogue: structure.dialogue });
  applySpeakerNames(structure, named.guesses);
  console.log(`\n화자 실명 ${named.guesses.length}건, $${named.usage.estimatedUsd.toFixed(4)}`);
  for (const g of named.guesses) {
    console.log(`  ${g.label} → ${g.name} (${g.confidence})`);
  }

  const built = buildMeetingFromStt({
    meetingId: "check-timeline",
    title: "타임라인 점검",
    durationSec,
    rawText: text,
    semantic: structure,
    timedSegments,
  });

  console.log(`\n=== 타임라인 ${built.timeline.segments.length}구간 ===`);
  const kindCount = new Map<string, number>();
  for (const seg of built.timeline.segments) {
    kindCount.set(seg.kind, (kindCount.get(seg.kind) ?? 0) + 1);
    console.log(`\n[${seg.start}-${seg.end}] (${seg.kind}) ${seg.title}`);
    console.log(`  ${seg.summary}`);
    for (const p of seg.points ?? []) console.log(`  - ${p}`);
    for (const n of seg.speakerNotes ?? []) {
      console.log(`  ${n.name}: ${n.said}`);
    }
    if (!seg.speakerNotes?.length) {
      console.log(`  화자: ${(seg.speakers ?? []).join(", ")}`);
    }
  }

  console.log(`\n종류 분포: ${[...kindCount].map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log(`참석자: ${built.meeting.participants.map((p) => p.name).join(", ")}`);
  console.log(`요약: ${built.timeline.overallSummary}`);

  const dialogueSpeakers = new Set(
    built.transcript.lines.map((l) => l.speaker),
  );
  console.log(`대화기록 화자: ${[...dialogueSpeakers].join(", ")}`);

  writeFileSync(
    join(BENCH, "report", "timeline-quality.json"),
    JSON.stringify({ timeline: built.timeline, participants: built.meeting.participants }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
