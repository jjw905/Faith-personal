/**
 * 실시간 파이프라인 품질, 안정성 점검 (고정 180초 다화자 구간).
 *
 * 보는 것
 * - 발화 누락: droppedTurns, 오디오 커버리지
 * - 말 잘림: 대화기록이 STT 원문을 얼마나 담았는지
 * - 군말 제거: 에-, 어-, 음- 이 대화기록에 남았는지
 * - 보정 추천, 화자 실명 추정 결과
 * - 비용
 *
 * DIARIZATION=pyannote 로 화자분리까지.
 * npx tsx --tsconfig tsconfig.json scripts/eval-realtime-quality.ts
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const AUDIO = join(
  process.cwd(),
  ".data/stt-bench/fixtures/assembly3-dense-180.wav",
);
const OUT = join(process.cwd(), ".data/stt-bench/report");
const DIARIZATION =
  process.env.DIARIZATION === "pyannote" ? "pyannote" : "none";

const FILLERS = ["에-", "어-", "음-", "그-", "저-", "어어", "음음"];

function dense(text: string) {
  return text.replace(/\s+/g, "").length;
}

function countFillers(text: string) {
  let n = 0;
  for (const f of FILLERS) {
    n += text.split(f).length - 1;
  }
  return n;
}

async function main() {
  if (!existsSync(AUDIO)) {
    console.error("고정 구간 오디오가 없습니다:", AUDIO);
    process.exit(1);
  }
  mkdirSync(OUT, { recursive: true });

  const { processRealtimeMeeting } = await import(
    "../src/lib/stt/realtime/process-realtime"
  );

  const started = Date.now();
  const out = await processRealtimeMeeting({
    meetingId: `mtg-rt-quality-${Date.now().toString(36)}`,
    title: "실시간 품질 점검 (180초 다화자)",
    audioPath: AUDIO,
    logUsage: false,
    diarization: DIARIZATION,
    onProgress: (p) => {
      if (p.utterances.length % 10 === 0) {
        process.stdout.write(
          `\r  오디오 ${p.audioSentSec.toFixed(0)}s, 발화 ${p.utterances.length}   `,
        );
      }
    },
  });
  process.stdout.write("\n");

  const rawChars = dense(out.stt.text);
  const dialogueText = out.structure.dialogue.map((d) => d.text).join("");
  const dialogueChars = dense(dialogueText);
  const corrections = out.transcript.lines.flatMap((l) => l.corrections ?? []);
  const speakerNames = [
    ...new Set(out.structure.dialogue.map((d) => d.speaker).filter(Boolean)),
  ];

  const report = {
    모델: out.stt.model,
    화자분리: out.diarization?.model ?? "없음",
    오디오초: Number(out.stt.durationSec.toFixed(1)),
    처리초: Number((out.stt.wallMs / 1000).toFixed(1)),
    첫응답ms: out.stt.firstDeltaMs,
    발화수: out.stt.utterances.length,
    놓친발화: out.stt.droppedTurns,
    과금오디오초: Number((out.stt.billedAudioSec ?? 0).toFixed(1)),
    STT글자: rawChars,
    대화기록글자: dialogueChars,
    대화보존율: Number((dialogueChars / Math.max(1, rawChars)).toFixed(3)),
    STT군말: countFillers(out.stt.text),
    대화군말: countFillers(dialogueText),
    보정추천: corrections.length,
    보정예시: corrections
      .slice(0, 5)
      .map((c) => `${c.wrong} -> ${c.suggestion}`),
    화자라벨: speakerNames,
    대화줄: out.structure.dialogue.length,
    타임라인: out.structure.timeline.length,
    결정: out.structure.decisions.length,
    액션: out.structure.actions.length,
    비용USD: Number(out.totalEstimatedUsd.toFixed(5)),
    전체초: Number(((Date.now() - started) / 1000).toFixed(1)),
  };

  console.log(JSON.stringify(report, null, 2));

  writeFileSync(
    join(OUT, `realtime-quality-${new Date().toISOString().slice(0, 10)}.json`),
    JSON.stringify(
      { ...report, sttText: out.stt.text, structure: out.structure },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
