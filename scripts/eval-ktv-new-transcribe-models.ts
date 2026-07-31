import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

config({ path: ".env" });
config({ path: ".env.local", override: true });

import { realtimeTranscribeFile } from "../src/lib/stt/realtime/transcribe-session";
import { REALTIME_STT_LIVE } from "../src/lib/stt/realtime/types";

const ROOT = ".data/stt-bench";
const AUDIO = `${ROOT}/ktv-briefing-20251231.mp3`;
const REFERENCE =
  process.env.REFERENCE ??
  "/Users/905jjw/Downloads/ktv-briefing-20251231 (1).txt";
const OUT = `${ROOT}/new-transcribe-compare`;

function normalized(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function bigramCoverage(reference: string, hypothesis: string): number {
  const grams = (text: string) => {
    const value = normalized(text);
    const out = new Set<string>();
    for (let index = 0; index + 1 < value.length; index += 1) {
      out.add(value.slice(index, index + 2));
    }
    return out;
  };
  const expected = grams(reference);
  const actual = grams(hypothesis);
  let hits = 0;
  expected.forEach((gram) => {
    if (actual.has(gram)) hits += 1;
  });
  return hits / Math.max(1, expected.size);
}

function charErrorRate(reference: string, hypothesis: string): number {
  const expected = normalized(reference);
  const actual = normalized(hypothesis);
  if (!expected) return actual ? 1 : 0;
  const row = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let left = 1; left <= expected.length; left += 1) {
    let diagonal = row[0]!;
    row[0] = left;
    for (let right = 1; right <= actual.length; right += 1) {
      const previous = row[right]!;
      row[right] = Math.min(
        row[right]! + 1,
        row[right - 1]! + 1,
        diagonal + Number(expected[left - 1] !== actual[right - 1]),
      );
      diagonal = previous;
    }
  }
  return row[actual.length]! / expected.length;
}

function cleanReference(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^참석자\s+\d+\s+\d{2}:\d{2}$/.test(line) &&
        !/^2026\./.test(line) &&
        line !== "ktv-briefing-20251231" &&
        line !== "조진원" &&
        line !== "clovanote.naver.com",
    )
    .join(" ");
}

function phraseChecks(text: string) {
  const value = normalized(text);
  const checks: Record<string, string[]> = {
    hostCall: ["이성택기자님"],
    firstReporter: ["한국일보", "이성택"],
    fourthReporter: ["뉴시스", "김영록"],
    ytnReporter: ["ytn", "홍민기"],
    sixthReporter: ["코리아헤럴드", "손지원"],
    seventhReporter: ["오마이뉴스", "이경태"],
    finalReporter: ["sbsbiz", "김한진"],
  };
  return Object.fromEntries(
    Object.entries(checks).map(([key, phrases]) => [
      key,
      phrases.every((phrase) => value.includes(normalized(phrase))),
    ]),
  );
}

async function transcribeFile() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY가 필요합니다.");
  const client = new OpenAI({ apiKey });
  const file = await toFile(readFileSync(AUDIO), "ktv-briefing.mp3");
  const started = Date.now();
  const response = await client.audio.transcriptions.create({
    model: "gpt-transcribe",
    file,
    languages: ["ko"],
    prompt: "대한민국 정부 정책 브리핑. 기자들이 소속과 이름을 말하고 질문한다.",
    keywords: [
      "KTV",
      "한국일보",
      "뉴시스",
      "YTN",
      "오마이뉴스",
      "SBS Biz",
    ],
  } as unknown as Parameters<
    typeof client.audio.transcriptions.create
  >[0]);
  const raw = response as unknown as {
    text?: string;
    usage?: unknown;
    languages?: string[];
  };
  return {
    model: "gpt-transcribe",
    text: raw.text ?? "",
    wallMs: Date.now() - started,
    usage: raw.usage,
    languages: raw.languages,
    estimatedUsd: (704.26125 / 60) * 0.006,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const reference = cleanReference(readFileSync(REFERENCE, "utf8"));
  const useCached = process.env.USE_CACHED === "1";
  const [file, live] = useCached
    ? [
        {
          model: "gpt-transcribe",
          text: readFileSync(join(OUT, "gpt-transcribe.txt"), "utf8"),
          wallMs: 0,
          estimatedUsd: 0,
        },
        {
          model: REALTIME_STT_LIVE,
          text: readFileSync(join(OUT, `${REALTIME_STT_LIVE}.txt`), "utf8"),
          wallMs: 0,
          estimatedUsd: 0,
          firstDeltaMs: null,
          droppedTurns: 0,
          utterances: [],
          eventCounts: {},
        },
      ]
    : await Promise.all([
        transcribeFile(),
        realtimeTranscribeFile(AUDIO, {
          model: REALTIME_STT_LIVE,
          language: "ko",
          delay: "high",
          commitEverySec: 8,
        }),
      ]);
  const results = [
    file,
    {
      model: live.model,
      text: live.text,
      wallMs: live.wallMs,
      estimatedUsd: live.estimatedUsd,
      firstDeltaMs: live.firstDeltaMs,
      droppedTurns: live.droppedTurns,
      utteranceCount: live.utterances.length,
      eventCounts: live.eventCounts,
    },
    {
      model: "gpt-4o-mini-transcribe",
      text: (
        JSON.parse(
          readFileSync(
            `${ROOT}/ktv__fresh-stt-word-timings.json`,
            "utf8",
          ),
        ) as { text: string }
      ).text,
      wallMs: 0,
      estimatedUsd: (704.26125 / 60) * 0.003,
    },
    {
      model: "gpt-transcribe-product-pipeline",
      text: (
        JSON.parse(
          readFileSync(
            `${OUT}/gpt-transcribe-product-stt.json`,
            "utf8",
          ),
        ) as { text: string }
      ).text,
      wallMs: 0,
      estimatedUsd: (704.26125 / 60) * 0.006,
    },
  ].map((result) => ({
    ...result,
    chars: result.text.length,
    cer: charErrorRate(reference, result.text),
    referenceCoverage: bigramCoverage(reference, result.text),
    phrases: phraseChecks(result.text),
  }));

  for (const result of results) {
    writeFileSync(join(OUT, `${result.model}.txt`), result.text);
  }
  const summaries = results.map((result) =>
    Object.fromEntries(
      Object.entries(result).filter(([key]) => key !== "text"),
    ),
  );
  writeFileSync(
    join(OUT, "gpt-transcribe-alignment-input.json"),
    JSON.stringify(
      {
        text: file.text,
        durationSec: 704.34,
        partRanges: [{ startSec: 0, endSec: 704.34 }],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(OUT, "summary.json"),
    JSON.stringify(summaries, null, 2),
  );
  console.log(JSON.stringify(summaries, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
