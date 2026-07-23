/**
 * 타임라인 실측 매핑의 '가치' 평가.
 * 정확도(MAE)가 아니라 상품 행동 기준으로 본다.
 *
 * 1) 라벨 시계: 구간 시작이 실제 안건 전환에 가까운가
 * 2) 점프: 타임라인 클릭 → 대화기록 첫 줄이 그 안건인가
 * 3) 순도: 구간에 묶인 대화가 실제 그 안건 시간대인가
 * 4) 비용: whisper 타이밍 추가분
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-timeline-value.ts
 */
import { readFileSync } from "node:fs";

import {
  alignDialogueToTimedSegments,
  mapTimelineByTimedSegments,
} from "../src/lib/stt/timed-segments";
import { formatClock } from "../src/lib/diarize-meeting";

type Seg = { id: string; start: string; end: string; title: string };
type Line = {
  id: string;
  time: string;
  text: string;
  segmentId: string;
  startSec: number;
};

function parseClock(c: string) {
  const [mm, ss] = c.split(":").map(Number);
  return (mm || 0) * 60 + (ss || 0);
}

function tokenize(s: string) {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2),
  );
}

function overlap(a: string, b: string) {
  const A = tokenize(a);
  const B = tokenize(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit += 1;
  return hit / Math.sqrt(A.size * B.size);
}

/** 현재 to-meeting과 동일한 even 식 segmentId */
function assignEven(
  startSec: number,
  durationSec: number,
  segments: Seg[],
): string {
  const idx = Math.min(
    segments.length - 1,
    Math.floor((startSec / Math.max(1, durationSec)) * segments.length),
  );
  return segments[idx]?.id ?? "s1";
}

/** 구간 실제 start-end 창으로 segmentId */
function assignByWindow(startSec: number, segments: Seg[]): string {
  if (segments.length === 0) return "s1";
  if (startSec <= parseClock(segments[0]!.start)) return segments[0]!.id;
  for (let i = 0; i < segments.length; i++) {
    const a = parseClock(segments[i]!.start);
    const b =
      i + 1 < segments.length
        ? parseClock(segments[i + 1]!.start)
        : Number.POSITIVE_INFINITY;
    if (startSec >= a && startSec < b) return segments[i]!.id;
  }
  return segments[segments.length - 1]!.id;
}

function buildEvenSegments(
  titles: string[],
  durationSec: number,
): Seg[] {
  const n = titles.length;
  const span = durationSec / n;
  return titles.map((title, i) => ({
    id: `s${i + 1}`,
    title,
    start: formatClock(i * span),
    end: formatClock(i === n - 1 ? durationSec : (i + 1) * span),
  }));
}

function main() {
  const timed = JSON.parse(
    readFileSync(".data/tmp-timed-cache.json", "utf8"),
  ) as Array<{ startSec: number; endSec: number; text: string }>;
  const row = JSON.parse(
    readFileSync(".data/user-meetings/mtg-up-8031660d.json", "utf8"),
  ) as {
    semantic: {
      timeline: Array<{ title: string; summary?: string; speakers?: string[] }>;
      dialogue: Array<{ startSec: number; text: string; speaker?: string }>;
    };
  };

  const durationSec = 420;
  const items = row.semantic.timeline;

  // gold windows from whisper landmarks
  const goldNeedles = [
    ["의석", "정돈"],
    ["소위원회", "심사", "듣겠"],
    ["먼저", "환경부"],
    ["다음으로", "고용노동부"],
    ["의결하도록"],
  ];
  const goldStarts = goldNeedles.map(
    (needles) =>
      timed.find((s) => needles.every((n) => s.text.includes(n)))?.startSec ??
      0,
  );
  const goldEnds = goldStarts.map((s, i) =>
    i + 1 < goldStarts.length ? goldStarts[i + 1]! : durationSec,
  );

  const evenSegs = buildEvenSegments(
    items.map((t) => t.title),
    durationSec,
  );
  const mappedSegs = mapTimelineByTimedSegments({
    items,
    timed,
    durationSec,
  });

  const aligned = alignDialogueToTimedSegments(
    row.semantic.dialogue,
    timed,
    durationSec,
  );

  // model-guess dialogue times (original)
  const rawDlg = row.semantic.dialogue;

  type Variant = {
    name: string;
    segs: Seg[];
    dialogue: typeof aligned;
    assign: "even" | "window";
  };

  const variants: Variant[] = [
    {
      name: "현재: 균등시계 + even식 segmentId",
      segs: evenSegs,
      dialogue: rawDlg,
      assign: "even",
    },
    {
      name: "실측시계만 (segmentId는 옛 even식)",
      segs: mappedSegs,
      dialogue: aligned,
      assign: "even",
    },
    {
      name: "실측시계 + 창 기반 segmentId",
      segs: mappedSegs,
      dialogue: aligned,
      assign: "window",
    },
  ];

  function buildLines(v: Variant): Line[] {
    return v.dialogue.map((d, i) => {
      const startSec = d.startSec;
      const segmentId =
        v.assign === "even"
          ? assignEven(startSec, durationSec, v.segs)
          : assignByWindow(startSec, v.segs);
      return {
        id: `l${i + 1}`,
        time: formatClock(startSec),
        text: d.text,
        segmentId,
        startSec,
      };
    });
  }

  function maeStarts(segs: Seg[]) {
    let s = 0;
    for (let i = 0; i < goldStarts.length; i++) {
      s += Math.abs(parseClock(segs[i]!.start) - goldStarts[i]!);
    }
    return s / goldStarts.length;
  }

  /** 점프 성공: 구간 클릭 시 첫 줄이 gold 창 안에 있는가 */
  function jumpHit(lines: Line[], segs: Seg[]) {
    let hit = 0;
    for (let i = 0; i < segs.length; i++) {
      const first = lines.find((l) => l.segmentId === segs[i]!.id);
      if (!first) continue;
      if (
        first.startSec >= goldStarts[i]! - 8 &&
        first.startSec < goldEnds[i]! + 8
      ) {
        hit += 1;
      }
    }
    return hit / segs.length;
  }

  /** 순도: 구간에 묶인 줄 중 gold 창 비율 */
  function purity(lines: Line[], segs: Seg[]) {
    let num = 0;
    let den = 0;
    for (let i = 0; i < segs.length; i++) {
      const inSeg = lines.filter((l) => l.segmentId === segs[i]!.id);
      den += inSeg.length;
      num += inSeg.filter(
        (l) =>
          l.startSec >= goldStarts[i]! - 5 && l.startSec < goldEnds[i]! + 5,
      ).length;
    }
    return den === 0 ? 0 : num / den;
  }

  /** 제목-내용 겹침: 구간 창 안 whisper 텍스트 vs 제목 */
  function titleFit(segs: Seg[]) {
    let sum = 0;
    for (let i = 0; i < segs.length; i++) {
      const a = parseClock(segs[i]!.start);
      const b = parseClock(segs[i]!.end);
      const body = timed
        .filter((t) => t.startSec >= a - 1 && t.startSec < b + 1)
        .map((t) => t.text)
        .join(" ");
      sum += overlap(segs[i]!.title, body);
    }
    return sum / segs.length;
  }

  console.log("금 앵커(whisper):");
  for (let i = 0; i < items.length; i++) {
    console.log(
      `  ${formatClock(goldStarts[i]!)}-${formatClock(goldEnds[i]!)}  ${items[i]!.title}`,
    );
  }

  console.log("\n=== 가치 지표 ===");
  console.log(
    "(점프=타임라인→대화 첫줄이 그 안건인가, 순도=묶인 대화가 그 안건 시간대인가)\n",
  );

  for (const v of variants) {
    const lines = buildLines(v);
    console.log(`## ${v.name}`);
    console.log(`  시계 MAE:     ${maeStarts(v.segs).toFixed(1)}s`);
    console.log(`  점프 성공률:  ${(jumpHit(lines, v.segs) * 100).toFixed(0)}%`);
    console.log(`  구간 순도:    ${(purity(lines, v.segs) * 100).toFixed(0)}%`);
    console.log(`  제목-내용맞춤: ${titleFit(v.segs).toFixed(3)}`);
    console.log("  구간:");
    for (const s of v.segs) {
      const first = lines.find((l) => l.segmentId === s.id);
      console.log(
        `    ${s.start}-${s.end} ${s.title}` +
          (first
            ? `  →점프 ${first.time} “${first.text.slice(0, 28)}”`
            : "  →점프 없음"),
      );
    }
    console.log("");
  }

  // cost
  const min = durationSec / 60;
  const sttMini = min * 0.003;
  const timing = min * 0.006;
  console.log("=== 비용 (이 회의 7분 기준, 추정) ===");
  console.log(`  STT만(4o-mini):           $${sttMini.toFixed(4)}`);
  console.log(`  + whisper 타이밍:         $${timing.toFixed(4)} (추가)`);
  console.log(
    `  합계:                     $${(sttMini + timing).toFixed(4)} (약 ${(1 + timing / sttMini).toFixed(1)}배)`,
  );

  console.log("\n=== 판정 요약 ===");
  const base = variants[0]!;
  const half = variants[1]!;
  const full = variants[2]!;
  const bL = buildLines(base);
  const hL = buildLines(half);
  const fL = buildLines(full);
  console.log(
    `점프 ${((jumpHit(bL, base.segs) * 100) | 0)}% → 실측만 ${((jumpHit(hL, half.segs) * 100) | 0)}% → 실측+창 ${((jumpHit(fL, full.segs) * 100) | 0)}%`,
  );
  console.log(
    `순도 ${((purity(bL, base.segs) * 100) | 0)}% → 실측만 ${((purity(hL, half.segs) * 100) | 0)}% → 실측+창 ${((purity(fL, full.segs) * 100) | 0)}%`,
  );
}

main();
