/**
 * 싱크가 한쪽으로 치우치는지 본다.
 *
 * 절대 오차만 보면 "평균 0.4초"로 괜찮아 보이지만, 오차가 전부 앞쪽이면
 * 재생할 때 하이라이트가 늘 먼저 넘어간다. 부호를 살려서 잰다.
 *
 * 정렬 알고리즘만 보지 않고, 화면에 실제로 쓰이는 값까지 따라간다.
 * 대화 줄 시각은 mm:ss 문자열로 저장됐다가 다시 초로 파싱되므로
 * 그 왕복까지 포함해야 사용자가 보는 오차가 나온다.
 */
import { readFileSync } from "fs";
import { join } from "path";

import { formatClock } from "../src/lib/diarize-meeting";
import {
  alignDialogueToTimedSegments,
  type TimedSegment,
} from "../src/lib/stt/timed-segments";
import { parseTranscriptTimeToSec } from "../src/lib/transcript-time";
import type { SemanticDialogueLine } from "../src/lib/stt/semantic-structure";

const BENCH = join(__dirname, "..", ".data/stt-bench");

function loadTimed(file: string): TimedSegment[] {
  const raw = JSON.parse(readFileSync(join(BENCH, file), "utf8")) as {
    segments?: TimedSegment[];
  };
  return (raw.segments ?? []).filter((s) => Boolean(s.text?.trim()));
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const FILLERS = ["어", "음", "그", "저", "이제", "뭐"];

type Case = {
  name: string;
  dialogue: SemanticDialogueLine[];
  truth: number[];
};

/**
 * 구조화 모델이 다시 나눈 대화기록을 흉내 낸다.
 * dropFiller를 켜면 원문에 있던 군말을 빼서 줄을 짧게 만든다.
 * 지금 파이프라인이 실제로 하는 일이라 이 조건에서 재야 한다.
 */
function buildCase(
  timed: TimedSegment[],
  opts: {
    name: string;
    minChars: number;
    maxChars: number;
    seed: number;
    dropFiller?: boolean;
  },
): Case {
  const rand = rng(opts.seed);
  const stream: Array<{ ch: string; sec: number }> = [];
  for (const seg of timed) {
    const chars = [...seg.text];
    const span = Math.max(0, seg.endSec - seg.startSec);
    chars.forEach((ch, i) => {
      stream.push({
        ch,
        sec: seg.startSec + (chars.length > 1 ? (i / chars.length) * span : 0),
      });
    });
    stream.push({ ch: " ", sec: seg.endSec });
  }

  const dialogue: SemanticDialogueLine[] = [];
  const truth: number[] = [];
  let i = 0;
  while (i < stream.length) {
    const len =
      opts.minChars +
      Math.floor(rand() * Math.max(1, opts.maxChars - opts.minChars));
    const slice = stream.slice(i, i + len);
    let text = slice
      .map((s) => s.ch)
      .join("")
      .trim();
    if (opts.dropFiller) {
      for (const f of FILLERS) {
        text = text.split(`${f} `).join(" ");
      }
      text = text.replace(/\s+/g, " ").trim();
    }
    if (text) {
      dialogue.push({ startSec: 0, text });
      truth.push(slice[0]!.sec);
    }
    i += len;
  }
  return { name: opts.name, dialogue, truth };
}

function report(label: string, errors: number[]) {
  const n = errors.length || 1;
  const mean = errors.reduce((s, e) => s + e, 0) / n;
  const abs = errors.map(Math.abs);
  const absMean = abs.reduce((s, e) => s + e, 0) / n;
  const early = errors.filter((e) => e < -0.05).length;
  const late = errors.filter((e) => e > 0.05).length;
  const sorted = [...errors].sort((a, b) => a - b);
  const pct = (v: number) => ((v / n) * 100).toFixed(0);
  console.log(
    `  ${label.padEnd(18)} 치우침 ${mean >= 0 ? "+" : ""}${mean.toFixed(2)}s` +
      ` / 절대 ${absMean.toFixed(2)}s` +
      ` / 앞섬 ${pct(early)}% 늦음 ${pct(late)}%` +
      ` / 최대앞섬 ${sorted[0]!.toFixed(1)}s`,
  );
}

function main() {
  const timed = loadTimed("assembly__timed-segments.json");
  const dur = timed.at(-1)!.endSec;
  console.log(`세그먼트 ${timed.length}개, ${(dur / 60).toFixed(1)}분\n`);

  const cases = [
    buildCase(timed, { name: "동일 전사 재분할", minChars: 40, maxChars: 120, seed: 1 }),
    buildCase(timed, { name: "군말 제거", minChars: 40, maxChars: 120, seed: 2, dropFiller: true }),
    buildCase(timed, { name: "짧은 줄 + 군말 제거", minChars: 15, maxChars: 45, seed: 3, dropFiller: true }),
  ];

  for (const c of cases) {
    console.log(`[${c.name}] 줄 ${c.dialogue.length}개`);
    const aligned = alignDialogueToTimedSegments(c.dialogue, timed, dur);

    // 1) 정렬 알고리즘이 내놓은 값 그대로
    report(
      "정렬 직후",
      aligned.map((d, i) => d.startSec - c.truth[i]!),
    );

    // 2) mm:ss 문자열로 저장했다가 다시 읽은 값 (지금 화면이 쓰는 값)
    report(
      "화면 표시값",
      aligned.map(
        (d, i) => parseTranscriptTimeToSec(formatClock(d.startSec)) - c.truth[i]!,
      ),
    );

    // 3) 소수점을 살려 저장했을 때 (수정안)
    report(
      "실수 초 저장",
      aligned.map(
        (d, i) => Math.round(d.startSec * 100) / 100 - c.truth[i]!,
      ),
    );
    console.log("");
  }
}

main();
