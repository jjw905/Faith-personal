import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";

const meetingId =
  process.env.MEETING_ID ??
  process.argv.slice(2).find((arg) => !arg.startsWith("-"));
const durationSec = Number(process.env.DURATION_SEC ?? 420);
const shouldWrite = process.argv.includes("--write");

if (!meetingId || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(meetingId)) {
  console.error(
    "사용법: MEETING_ID=<회의 ID> DURATION_SEC=<초> npx tsx scripts/rebuild-meeting-structure.ts --write",
  );
  process.exit(1);
}

if (!Number.isFinite(durationSec) || durationSec <= 0) {
  console.error("DURATION_SEC는 0보다 큰 숫자여야 합니다.");
  process.exit(1);
}

if (!shouldWrite) {
  console.error(
    "이 스크립트는 로컬 회의 데이터를 덮어씁니다. 의도를 확인한 뒤 --write를 붙여 실행하세요.",
  );
  process.exit(1);
}

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { buildSemanticStructure } = await import(
    "../src/lib/stt/semantic-structure"
  );
  const { buildMeetingFromStt } = await import("../src/lib/stt/to-meeting");

  const meetingPath = `.data/user-meetings/${meetingId}.json`;
  const row = JSON.parse(readFileSync(meetingPath, "utf8")) as {
    id: string;
    rawText: string;
    workspace: "personal" | "team";
    meeting: { title: string; date: string };
    transcript?: unknown;
    timeline?: unknown;
    semantic?: unknown;
    updatedAt?: string;
  };

  console.log("structuring…", row.rawText.length, "chars");
  const { structure: semantic, usage } = await buildSemanticStructure(
    row.rawText,
    durationSec,
  );
  console.log({
    dialogue: semantic.dialogue.length,
    timeline: semantic.timeline.length,
    usage,
    sample: semantic.dialogue.slice(0, 3).map((d) => ({
      t: d.startSec,
      head: d.text.slice(0, 40),
    })),
  });

  if (semantic.dialogue.length === 0) {
    throw new Error("model returned empty dialogue");
  }

  const built = buildMeetingFromStt({
    meetingId: row.id,
    title: row.meeting.title,
    durationSec,
    rawText: row.rawText,
    semantic,
    workspace: row.workspace,
  });

  const next = {
    ...row,
    meeting: { ...built.meeting, date: row.meeting.date },
    transcript: built.transcript,
    timeline: built.timeline,
    semantic,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(meetingPath, JSON.stringify(next, null, 2));
  console.log("saved lines", next.transcript.lines.length);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
