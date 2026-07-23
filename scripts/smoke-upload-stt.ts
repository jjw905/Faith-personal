/**
 * 업로드 STT 파이프라인 스모크 (샘플 wav → 회의 레코드).
 * 사용: npx tsx --tsconfig tsconfig.json scripts/smoke-upload-stt.ts
 */
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { chunkedTranscribeBuffer } = await import(
    "../src/lib/stt/chunked-transcribe"
  );
  const { buildSemanticStructure } = await import(
    "../src/lib/stt/semantic-structure"
  );
  const { buildMeetingFromStt } = await import("../src/lib/stt/to-meeting");
  const { saveUserMeeting, getUserMeeting, workDirForMeeting } = await import(
    "../src/lib/user-meetings-store"
  );

  const sample = join(
    process.cwd(),
    "public/samples/audio/meeting-summary-noise30.wav",
  );
  if (!existsSync(sample)) throw new Error(`missing ${sample}`);

  const meetingId = `mtg-smoke-${Date.now().toString(36)}`;
  const workDir = workDirForMeeting(meetingId);
  const bytes = readFileSync(sample);

  console.log("STT…");
  const stt = await chunkedTranscribeBuffer({
    audioBytes: bytes,
    filename: "meeting-summary-noise30.wav",
    workDir,
    model: "gpt-4o-mini-transcribe",
  });
  console.log(`chars=${stt.text.length} duration=${stt.durationSec.toFixed(1)}s`);

  console.log("semantic…");
  const { structure: semantic, usage: structureUsage } =
    await buildSemanticStructure(stt.text, stt.durationSec);
  console.log("structure usage", structureUsage, "stt usage", stt.usage);
  const built = buildMeetingFromStt({
    meetingId,
    title: "스모크 업로드 회의",
    durationSec: stt.durationSec,
    rawText: stt.text,
    semantic,
  });

  const now = new Date().toISOString();
  saveUserMeeting({
    id: meetingId,
    userId: "smoke-user",
    vaultFileId: "smoke-vault",
    model: "gpt-4o-mini-transcribe",
    phase: "done",
    createdAt: now,
    updatedAt: now,
    workspace: "personal",
    meeting: built.meeting,
    transcript: built.transcript,
    timeline: built.timeline,
    rawText: stt.text,
    semantic,
  });

  const row = getUserMeeting(meetingId);

  console.log({
    meetingId,
    phase: row?.phase,
    summaryChars: row?.timeline.overallSummary.length ?? 0,
    segments: row?.timeline.segments.length ?? 0,
    lines: row?.transcript.lines.length ?? 0,
    summaryPreview: row?.timeline.overallSummary.slice(0, 120),
  });

  if (
    !row ||
    row.phase !== "done" ||
    row.timeline.segments.length < 1 ||
    row.transcript.lines.length < 1
  ) {
    throw new Error("smoke failed: empty meeting payload");
  }
  console.log("OK", `/meetings/${meetingId}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
