import { config } from "dotenv";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

config({ path: ".env" });
config({ path: ".env.local", override: true });

type Segment = {
  startSec: number;
  endSec: number;
  speaker: string;
  text?: string;
};

const OUT = join(process.cwd(), ".data", "stt-bench", "diarization-compare");
const SAMPLE_ID = process.env.SAMPLE_ID?.trim();
const SAMPLES = [
  {
    id: "assembly3-420-540",
    label: "국회 환노위, 07:00~09:00",
    audio: join(OUT, "assembly3-420-540.wav"),
    note:
      "로컬은 실제 역할 4명을 유지했다. 4o는 0.1초 응답을 별도 화자로 늘렸고, 한국어 고정 후에도 78~103초를 영어로 잘못 전사했다.",
  },
  {
    id: "finance-340-450",
    label: "재정기획 회의, 05:40~07:30",
    audio: join(OUT, "finance-340-450.wav"),
    note:
      "위원장, 차관, 위원장 순서의 2명 전환을 두 모델이 동일하게 판정했다.",
  },
] as const;

function countTransitions(segments: Segment[]): number {
  let count = 0;
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index - 1]!.speaker !== segments[index]!.speaker) count += 1;
  }
  return count;
}

function speakerAt(segments: Segment[], sec: number): string | null {
  const active = segments.filter(
    (segment) => segment.startSec <= sec && sec < segment.endSec,
  );
  if (active.length === 0) return null;
  return active.reduce((best, segment) => {
    const bestSpan = best.endSec - best.startSec;
    const span = segment.endSec - segment.startSec;
    return span > bestSpan ? segment : best;
  }).speaker;
}

/** 라벨 이름과 무관하게 두 결과가 같은 시각들을 같은 화자로 묶는지 비교한다. */
function coassignmentAgreement(
  left: Segment[],
  right: Segment[],
  durationSec: number,
): { agreement: number | null; comparedPairs: number } {
  const points = Array.from(
    { length: Math.ceil(durationSec * 2) },
    (_, index) => index / 2,
  )
    .map((sec) => ({
      left: speakerAt(left, sec),
      right: speakerAt(right, sec),
    }))
    .filter(
      (point): point is { left: string; right: string } =>
        point.left !== null && point.right !== null,
    );

  let comparedPairs = 0;
  let agreedPairs = 0;
  for (let a = 0; a < points.length; a += 1) {
    for (let b = a + 1; b < points.length; b += 1) {
      const leftSame = points[a]!.left === points[b]!.left;
      const rightSame = points[a]!.right === points[b]!.right;
      comparedPairs += 1;
      if (leftSame === rightSame) agreedPairs += 1;
    }
  }
  return {
    agreement: comparedPairs > 0 ? agreedPairs / comparedPairs : null,
    comparedPairs,
  };
}

async function openAiDiarize(
  client: OpenAI,
  audioPath: string,
): Promise<{
  segments: Segment[];
  text: string;
  usage: unknown;
  wallMs: number;
}> {
  const started = Date.now();
  const bytes = readFileSync(audioPath);
  const file = await toFile(bytes, audioPath.split("/").at(-1) ?? "audio.wav");
  const response = await client.audio.transcriptions.create({
    model: "gpt-4o-transcribe-diarize",
    file,
    response_format: "diarized_json",
    chunking_strategy: "auto",
    language: "ko",
  } as unknown as Parameters<
    typeof client.audio.transcriptions.create
  >[0]);
  const raw = response as unknown as {
    text?: string;
    usage?: unknown;
    segments?: Array<{
      start?: number;
      end?: number;
      speaker?: string;
      text?: string;
    }>;
  };
  return {
    segments: (raw.segments ?? []).map((segment) => ({
      startSec: Number(segment.start ?? 0),
      endSec: Number(segment.end ?? segment.start ?? 0),
      speaker: segment.speaker || "unknown",
      text: segment.text?.trim(),
    })),
    text: raw.text ?? "",
    usage: raw.usage,
    wallMs: Date.now() - started,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY가 필요합니다.");

  const [
    { realtimeTranscribeFile },
    {
      alignRealtimeUtterancesToSpeakers,
      diarizeAudio,
      formatSpeakerTranscript,
    },
  ] = await Promise.all([
    import("../src/lib/stt/realtime/transcribe-session"),
    import("../src/lib/stt/diarization"),
  ]);
  const client = new OpenAI({ apiKey });
  const summaries = [];

  for (const sample of SAMPLES.filter(
    (candidate) => !SAMPLE_ID || candidate.id === SAMPLE_ID,
  )) {
    const [realtime, local, openai] = await Promise.all([
      realtimeTranscribeFile(sample.audio),
      diarizeAudio({ audioPath: sample.audio }),
      openAiDiarize(client, sample.audio),
    ]);
    const localSegments = local.segments as Segment[];
    const localUtterances = alignRealtimeUtterancesToSpeakers({
      utterances: realtime.utterances,
      diarization: local,
      durationSec: realtime.durationSec,
    });
    const agreement = coassignmentAgreement(
      localSegments,
      openai.segments,
      realtime.durationSec,
    );
    const localSpeakers = new Set(
      localSegments.map((segment) => segment.speaker),
    ).size;
    const openAiSpeakers = new Set(
      openai.segments.map((segment) => segment.speaker),
    ).size;
    const summary = {
      id: sample.id,
      label: sample.label,
      durationSec: realtime.durationSec,
      realtime: {
        model: realtime.model,
        wallMs: realtime.wallMs,
        estimatedUsd: realtime.estimatedUsd,
        utteranceCount: realtime.utterances.length,
      },
      local: {
        model: local.model,
        wallMs: local.wallMs,
        speakerCount: localSpeakers,
        segmentCount: localSegments.length,
        transitionCount: countTransitions(localSegments),
      },
      openai: {
        model: "gpt-4o-transcribe-diarize",
        wallMs: openai.wallMs,
        estimatedUsd: (realtime.durationSec / 60) * 0.006,
        speakerCount: openAiSpeakers,
        segmentCount: openai.segments.length,
        transitionCount: countTransitions(openai.segments),
        usage: openai.usage,
      },
      coassignmentAgreement: agreement.agreement,
      comparedPairs: agreement.comparedPairs,
    };
    summaries.push(summary);
    writeFileSync(
      join(OUT, `${sample.id}.json`),
      JSON.stringify(
        {
          ...summary,
          realtimeText: realtime.text,
          localSpeakerTranscript: formatSpeakerTranscript(localUtterances),
          localSegments,
          openAiText: openai.text,
          openAiSegments: openai.segments,
        },
        null,
        2,
      ),
    );
    console.log(JSON.stringify(summary, null, 2));
  }

  const summaryPath = join(OUT, "summary.json");
  const previous =
    SAMPLE_ID && existsSync(summaryPath)
      ? (JSON.parse(readFileSync(summaryPath, "utf8")) as typeof summaries)
      : [];
  const merged = new Map(previous.map((item) => [item.id, item]));
  for (const item of summaries) merged.set(item.id, item);
  const allSummaries = [...merged.values()];
  writeFileSync(summaryPath, JSON.stringify(allSummaries, null, 2));

  const report = [
    "# Faith 화자분리 모델 비교",
    "",
    `날짜: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "- 실시간 전사: gpt-realtime-whisper",
    "- 로컬 화자분리: pyannote segmentation 3.0 + 3D-Speaker",
    "- API 일체형: gpt-4o-transcribe-diarize",
    "- 비교 지표: 화자 라벨 이름과 무관한 시각별 동일 화자 묶음 일치도",
    "",
    ...allSummaries.flatMap((item) => [
      `## ${item.label}`,
      "",
      `- 길이: ${item.durationSec.toFixed(1)}초`,
      `- 로컬: 화자 ${item.local.speakerCount}명, 전환 ${item.local.transitionCount}회, 처리 ${(item.local.wallMs / 1000).toFixed(1)}초`,
      `- 4o diarize: 화자 ${item.openai.speakerCount}명, 전환 ${item.openai.transitionCount}회, 처리 ${(item.openai.wallMs / 1000).toFixed(1)}초`,
      `- 동일 화자 묶음 일치도: ${item.coassignmentAgreement == null ? "-" : `${(item.coassignmentAgreement * 100).toFixed(1)}%`}`,
      `- 실시간 + 로컬 API 비용: $${item.realtime.estimatedUsd.toFixed(4)} (로컬 Worker 비용 별도)`,
      `- 실시간 + 4o diarize API 비용: 약 $${(item.realtime.estimatedUsd + item.openai.estimatedUsd).toFixed(4)}`,
      `- 판정: ${SAMPLES.find((sample) => sample.id === item.id)?.note ?? ""}`,
      "",
    ]),
  ].join("\n");
  writeFileSync(
    join(
      process.cwd(),
      "Faith-office",
      `Faith_화자분리_모델비교_${new Date().toISOString().slice(0, 10)}.md`,
    ),
    report,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
