/**
 * 실시간 파이프라인 평가 (이전 벤치 영상 2개).
 * Realtime STT(gpt-realtime-whisper) + 선택적 pyannote 화자분리
 * → 구조화(gpt-4o-mini) → 회의 산출.
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-realtime-pipeline.ts
 * MAX_SEC=180 으로 앞부분만 가능.
 * DIARIZATION=pyannote 로 Community-1 화자분리 결합.
 */
import { config } from "dotenv";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const MAX_SEC = Number(process.env.MAX_SEC || "0") || undefined;
const SAMPLE_ID = process.env.SAMPLE_ID?.trim();
const DIARIZATION =
  process.env.DIARIZATION === "pyannote" ? "pyannote" : "none";
const OUT = join(
  process.cwd(),
  DIARIZATION === "pyannote"
    ? ".data/stt-bench/realtime-diarization"
    : ".data/stt-bench/realtime",
);

type Sample = {
  id: string;
  label: string;
  audio: string;
  reference: string;
  title: string;
};

const SAMPLES: Sample[] = [
  {
    id: "assembly2",
    label: "국회 환노위 426-3",
    audio: join(process.cwd(), ".data/stt-bench/assembly2-envlabor-20250704.mp3"),
    reference: join(process.cwd(), ".data/stt-bench/assembly2-reference.txt"),
    title: "제426회 국회 환경노동위원회 (실시간)",
  },
  {
    id: "ktv",
    label: "KTV 브리핑",
    audio: join(process.cwd(), ".data/stt-bench/ktv-briefing-20251231.mp3"),
    reference: join(process.cwd(), ".data/stt-bench/ktv-reference.txt"),
    title: "KTV 브리핑 (실시간)",
  },
];

function compact(s: string) {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\w가-힣]/g, "");
}

function coverage(ref: string, hyp: string) {
  const R = compact(ref);
  const H = compact(hyp);
  if (!R.length) return 0;
  // 연속 4-gram 커버
  const n = 4;
  let hit = 0;
  let tot = 0;
  for (let i = 0; i + n <= R.length; i += n) {
    tot += 1;
    if (H.includes(R.slice(i, i + n))) hit += 1;
  }
  return tot === 0 ? 0 : hit / tot;
}

function bigramF1(ref: string, hyp: string) {
  const grams = (s: string) => {
    const c = compact(s);
    const out = new Set<string>();
    for (let i = 0; i < c.length - 1; i++) out.add(c.slice(i, i + 2));
    return out;
  };
  const R = grams(ref);
  const H = grams(hyp);
  if (!R.size || !H.size) return 0;
  let inter = 0;
  for (const g of R) if (H.has(g)) inter += 1;
  const p = inter / H.size;
  const r = inter / R.size;
  return p + r === 0 ? 0 : (2 * p * r) / (p + r);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { processRealtimeMeeting } = await import(
    "../src/lib/stt/realtime/process-realtime"
  );

  const results = [];

  for (const sample of SAMPLES.filter(
    (candidate) => !SAMPLE_ID || candidate.id === SAMPLE_ID,
  )) {
    if (!existsSync(sample.audio)) {
      console.error("missing audio", sample.audio);
      continue;
    }
    const ref = existsSync(sample.reference)
      ? readFileSync(sample.reference, "utf8")
      : "";

    console.log("\n########################################");
    console.log(sample.id, sample.label, MAX_SEC ? `max=${MAX_SEC}s` : "full");

    const meetingId = `mtg-rt-${sample.id}-${Date.now().toString(36)}`;
    let lastLog = 0;
    const started = Date.now();

    const out = await processRealtimeMeeting({
      meetingId,
      title: sample.title,
      audioPath: sample.audio,
      maxAudioSec: MAX_SEC,
      logUsage: true,
      diarization: DIARIZATION,
      onProgress: (p) => {
        const now = Date.now();
        if (now - lastLog < 5000) return;
        lastLog = now;
        console.log(
          `  … audio=${p.audioSentSec.toFixed(0)}s utterances=${p.utterances.length} partial=${p.partialText.slice(0, 24)}`,
        );
      },
    });

    const refUse =
      MAX_SEC && ref
        ? ref.slice(0, Math.floor(ref.length * (MAX_SEC / Math.max(MAX_SEC, 600))))
        : ref;

    const cov = refUse ? coverage(refUse, out.stt.text) : null;
    const f1 = refUse ? bigramF1(refUse, out.stt.text) : null;

    const row = {
      id: sample.id,
      label: sample.label,
      meetingId,
      maxAudioSec: MAX_SEC ?? null,
      durationSec: out.stt.durationSec,
      wallMs: out.stt.wallMs,
      firstDeltaMs: out.stt.firstDeltaMs,
      sttModel: out.stt.model,
      structureModel: out.structureUsage.model,
      diarizationModel: out.diarization?.model ?? null,
      diarizationWallMs: out.diarization?.wallMs ?? null,
      speakerCount: out.diarization?.speakerCount ?? 0,
      utteranceCount: out.stt.utterances.length,
      sttChars: out.stt.text.length,
      dialogueLines: out.structure.dialogue.length,
      timelineSegments: out.structure.timeline.length,
      decisions: out.structure.decisions.length,
      actions: out.structure.actions.length,
      keywords: out.structure.keywords,
      coverage: cov,
      bigramF1: f1,
      estimatedUsd: out.totalEstimatedUsd,
      sttUsd: out.stt.estimatedUsd,
      structureUsd: out.structureUsage.estimatedUsd,
      eventCounts: out.stt.eventCounts,
      summaryPreview: out.structure.overallSummary.slice(0, 160),
      timelineTitles: out.structure.timeline.map((t) => t.title),
      elapsedWallMs: Date.now() - started,
    };

    results.push(row);
    writeFileSync(
      join(OUT, `${sample.id}.json`),
      JSON.stringify(
        {
          ...row,
          sttText: out.stt.text,
          speakerUtterances: out.speakerUtterances,
          diarization: out.diarization,
          structure: out.structure,
          timeline: out.timeline,
          transcriptLineCount: out.transcript.lines.length,
        },
        null,
        2,
      ),
    );

    console.log(
      JSON.stringify(
        {
          durationSec: row.durationSec.toFixed(1),
          wallSec: (row.wallMs / 1000).toFixed(1),
          firstDeltaMs: row.firstDeltaMs,
          utterances: row.utteranceCount,
          speakers: row.speakerCount,
          dialogue: row.dialogueLines,
          timeline: row.timelineSegments,
          coverage: cov?.toFixed(3),
          f1: f1?.toFixed(3),
          usd: row.estimatedUsd.toFixed(4),
          titles: row.timelineTitles,
        },
        null,
        2,
      ),
    );
  }

  writeFileSync(join(OUT, "summary.json"), JSON.stringify(results, null, 2));

  // 중간 산출물. 확정 내용은 Faith-office/03_STT_품질_재생/Faith_STT_품질_재생.md에 합친다.
  const reportDir = join(process.cwd(), ".data/stt-bench/report");
  mkdirSync(reportDir, { recursive: true });
  const lines = [
    "Faith 실시간 STT 파이프라인 평가",
    `날짜: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "구성",
    "- STT: gpt-realtime-whisper (Realtime transcription)",
    `- 화자분리: ${results[0]?.diarizationModel ?? "없음"}`,
    "- 구조화: gpt-4o-mini (업로드 경로와 동일)",
    "- 산출: 요약, 키워드, 타임라인, 대화, 결정, 액션",
    "",
    "샘플",
  ];
  for (const r of results) {
    lines.push(
      `- ${r.id}: ${r.label}`,
      `  길이 ${r.durationSec.toFixed(0)}s, 벽시계 ${(r.wallMs / 1000).toFixed(0)}s, 첫델타 ${r.firstDeltaMs ?? "-"}ms`,
      `  발화 ${r.utteranceCount}, 대화 ${r.dialogueLines}, 타임라인 ${r.timelineSegments}`,
      `  coverage ${r.coverage?.toFixed(3) ?? "-"}, F1 ${r.bigramF1?.toFixed(3) ?? "-"}, 비용 $${r.estimatedUsd.toFixed(4)}`,
      `  요약: ${r.summaryPreview}`,
      "",
    );
  }
  writeFileSync(
    join(reportDir, `realtime-pipeline-${new Date().toISOString().slice(0, 10)}.txt`),
    lines.join("\n"),
  );

  console.log("\nwrote", join(OUT, "summary.json"));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
