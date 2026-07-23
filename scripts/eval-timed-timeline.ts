/**
 * whisper verbose 실측 timestamp → dialogue 정렬 → 타임라인 A매핑 검증.
 * 기존 회의 semantic + assembly 오디오로 실측 세그먼트를 뽑아 비교.
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-timed-timeline.ts
 */
import { config } from "dotenv";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { chunkedTranscribe } = await import("../src/lib/stt/chunked-transcribe");
  const {
    alignDialogueToTimedSegments,
    mapTimelineByTimedSegments,
  } = await import("../src/lib/stt/timed-segments");
  const { formatClock } = await import("../src/lib/diarize-meeting");

  const meetingPath = join(
    process.cwd(),
    ".data/user-meetings/mtg-up-8031660d.json",
  );
  const audioPath =
    ".data/vault/users/cmrt7ksf60000uer8kgvecpuq/1b1ad554-8cca-47dc-8b20-10f193c58e1e/assembly-7min.mp3";
  const workDir = join(process.cwd(), ".data/tmp-timed-eval");

  const row = JSON.parse(readFileSync(meetingPath, "utf8")) as {
    id: string;
    semantic: {
      timeline: Array<{
        title: string;
        summary?: string;
        speakers?: string[];
        kind?: string;
      }>;
      dialogue: Array<{ startSec: number; text: string; speaker?: string }>;
    };
  };

  mkdirSync(workDir, { recursive: true });
  console.log("whisper timed STT…");
  const stt = await chunkedTranscribe({
    audioPath,
    workDir: join(workDir, "chunks"),
    model: "whisper-1",
  });
  console.log({
    durationSec: stt.durationSec.toFixed(1),
    timedN: stt.timedSegments.length,
    usageUsd: stt.usage.estimatedUsd.toFixed(4),
    sampleTimed: stt.timedSegments.slice(0, 5).map((s) => ({
      t: `${formatClock(s.startSec)}-${formatClock(s.endSec)}`,
      text: s.text.slice(0, 40),
    })),
  });

  const goldNeedles = [
    ["의석", "정돈"],
    ["소위원회", "심사", "듣겠"],
    ["먼저", "환경부"],
    ["다음으로", "고용노동부"],
    ["의결하도록"],
  ];

  function findTimedFuzzy(needles: string[]) {
    const hit = stt.timedSegments.find((s) =>
      needles.every((n) => s.text.includes(n)),
    );
    return hit?.startSec ?? null;
  }

  console.log("\n실측 앵커 (whisper segment, fuzzy):");
  for (const needles of goldNeedles) {
    const sec = findTimedFuzzy(needles);
    console.log(
      `  ${sec == null ? "MISS" : formatClock(sec)}  ${needles.join("+")}`,
    );
  }

  const aligned = alignDialogueToTimedSegments(
    row.semantic.dialogue,
    stt.timedSegments,
    stt.durationSec,
  );

  const even = row.semantic.timeline.map((t, i, arr) => {
    const span = stt.durationSec / arr.length;
    return {
      title: t.title,
      startSec: i * span,
      endSec: i === arr.length - 1 ? stt.durationSec : (i + 1) * span,
    };
  });

  const mapped = mapTimelineByTimedSegments({
    items: row.semantic.timeline,
    timed: stt.timedSegments,
    durationSec: stt.durationSec,
  });

  console.log("\n균등분할:");
  for (const e of even) {
    console.log(`  ${formatClock(e.startSec)}-${formatClock(e.endSec)}  ${e.title}`);
  }

  console.log("\nA매핑 (whisper 실측 세그먼트):");
  for (const s of mapped) {
    console.log(`  ${s.start}-${s.end}  ${s.title}`);
  }

  console.log("\ndialogue 정렬 샘플:");
  for (const d of aligned.slice(0, 6)) {
    console.log(`  ${formatClock(d.startSec)}  ${d.text.slice(0, 42)}`);
  }

  const goldStarts = goldNeedles.map((n) => findTimedFuzzy(n) ?? 0);
  function maeStarts(starts: number[]) {
    let s = 0;
    for (let i = 0; i < goldStarts.length; i++) {
      s += Math.abs(starts[i]! - goldStarts[i]!);
    }
    return s / goldStarts.length;
  }

  const evenStarts = even.map((e) => e.startSec);
  const mapStarts = mapped.map((s) => {
    const [mm, ss] = s.start.split(":").map(Number);
    return (mm || 0) * 60 + (ss || 0);
  });

  console.log("\n시작시각 MAE vs whisper 앵커:");
  console.log(`  균등:   ${maeStarts(evenStarts).toFixed(1)}s`);
  console.log(`  A실측: ${maeStarts(mapStarts).toFixed(1)}s`);

  function hitRate(
    rows: Array<{ startSec: number; endSec: number }>,
  ) {
    let hit = 0;
    for (let i = 0; i < goldStarts.length; i++) {
      const sec = goldStarts[i]!;
      const r = rows[i]!;
      if (sec >= r.startSec - 3 && sec <= r.endSec + 3) hit += 1;
    }
    return hit / goldStarts.length;
  }

  console.log("\n전환문구 구간 hit:");
  console.log(`  균등:   ${hitRate(even).toFixed(2)}`);
  console.log(
    `  A실측: ${hitRate(
      mapped.map((s) => {
        const parse = (c: string) => {
          const [mm, ss] = c.split(":").map(Number);
          return (mm || 0) * 60 + (ss || 0);
        };
        return { startSec: parse(s.start), endSec: parse(s.end) };
      }),
    ).toFixed(2)}`,
  );

  rmSync(workDir, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
