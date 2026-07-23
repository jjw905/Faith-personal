import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { buildSemanticStructure } = await import(
    "../src/lib/stt/semantic-structure"
  );
  const { buildMeetingFromStt } = await import("../src/lib/stt/to-meeting");

  const path = ".data/user-meetings/mtg-up-d3459708.json";
  const row = JSON.parse(readFileSync(path, "utf8")) as {
    id: string;
    rawText: string;
    workspace: "personal" | "team";
    meeting: { title: string; date: string };
    transcript?: unknown;
    timeline?: unknown;
    semantic?: unknown;
    updatedAt?: string;
  };

  const durationSec = 420;
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
  writeFileSync(path, JSON.stringify(next, null, 2));
  console.log("saved lines", next.transcript.lines.length);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
