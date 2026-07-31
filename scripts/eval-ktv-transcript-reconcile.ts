import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";

config({ path: ".env" });
config({ path: ".env.local", override: true });

import { reconcileTranscriptVariants } from "../src/lib/stt/transcript-reconcile";
import type { TimedSegment } from "../src/lib/stt/timed-segments";

const INPUT = ".data/stt-bench/ktv__fresh-stt-word-timings.json";
const OUTPUT = ".data/stt-bench/ktv__reconciled-transcript.json";

async function main() {
  const cached = JSON.parse(readFileSync(INPUT, "utf8")) as {
    text: string;
    durationSec: number;
    segments: TimedSegment[];
  };
  const parts = cached.text.split(/\r?\n/).filter(Boolean);
  const ranges = parts.map((_, index) => ({
    startSec: index * 300,
    endSec: Math.min(cached.durationSec, (index + 1) * 300),
  }));
  const reconciled = await reconcileTranscriptVariants({
    parts,
    partRanges: ranges,
    timedSegments: cached.segments,
  });
  writeFileSync(
    OUTPUT,
    JSON.stringify(
      {
        text: reconciled.text,
        durationSec: cached.durationSec,
        segments: cached.segments,
        words: [],
        partRanges: ranges,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      restoredHostCall: reconciled.text.includes("이성택 기자님"),
      restoredFinalReporter: reconciled.text.includes("김한진"),
      usage: reconciled.usage,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
