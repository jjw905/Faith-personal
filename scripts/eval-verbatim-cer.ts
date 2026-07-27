/**
 * 축어 정답지로 CER을 잰다.
 *
 * 그동안 쓰던 정답은 국회 속기록이었다. 속기록은 발화 정리본이라 군말과
 * 겹치는 말을 안 적고, 문장을 다듬는다. 그걸 정답으로 삼으면 모델이 더
 * 정확히 받아도 오류로 잡힌다. 사용자가 녹음을 들으며 받아적은 축어본으로
 * 다시 재서, 실제로 얼마나 틀리는지 본다.
 *
 * 정답지는 앞부분만 있으므로 전사 앞머리와 견준다. 길이를 조금씩 바꿔 가며
 * 가장 잘 맞는 지점을 찾는다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-verbatim-cer.ts
 */
import { readFileSync } from "node:fs";

const REFERENCE = ".data/stt-bench/fixtures/assembly3-verbatim.reference.txt";

const CANDIDATES = [
  {
    label: "용어 없이",
    file: ".data/stt-bench/assembly__gpt-4o-mini-transcribe__chunked-silencecut.txt",
  },
  {
    label: "용어 주입",
    file: ".data/stt-bench/mtg-stt-assembly__glossary-transcript.txt",
  },
];

/** 화자 머리표는 정답지 표기이지 발화가 아니다. */
function stripSpeakerTags(text: string): string {
  return text.replace(/\[[^\]]{1,20}\]/g, " ");
}

/** 정답지에 섞인 메모는 발화가 아니다. */
function stripNotes(text: string): string {
  return text.replace(/(이후\s*)?(내용은\s*)?문제\s*없음/g, " ");
}

function norm(text: string): string {
  return stripNotes(stripSpeakerTags(text))
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/g, "");
}

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(
        Math.min(
          cur[j - 1]! + 1,
          prev[j]! + 1,
          prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * 문단마다 전사에서 짝을 찾아 잰다.
 *
 * 받아적은 문서에는 "3항 내용은 문제 없음"처럼 건너뛴 데가 있다. 통째로
 * 이어 붙여 비교하면 건너뛴 만큼이 전부 오류로 잡힌다. 문단별로 짝을 찾고,
 * 짝이 있는 구간만 더한다. 순서대로 진행하니 앞 문단이 끝난 자리부터 찾는다.
 */
function alignedCer(refParas: string[], hyp: string) {
  let cursor = 0;
  let totalDist = 0;
  let totalRef = 0;
  let matched = 0;
  const worst: Array<{ dist: number; len: number; ref: string; hyp: string }> = [];

  for (const para of refParas) {
    const lo = Math.max(0, cursor - 120);
    const hi = Math.min(hyp.length, cursor + 900);
    let best = { dist: Infinity, start: cursor, end: cursor };

    const tryAt = (start: number, len: number) => {
      const end = Math.min(hyp.length, start + len);
      const d = editDistance(para, hyp.slice(start, end));
      if (d < best.dist) best = { dist: d, start, end };
    };

    for (let start = lo; start <= hi; start += 12) {
      for (const scale of [0.9, 1.05, 1.2]) {
        tryAt(start, Math.round(para.length * scale));
      }
    }
    for (let start = Math.max(lo, best.start - 12); start <= best.start + 12; start++) {
      for (let len = Math.round(para.length * 0.85); len <= Math.round(para.length * 1.25); len += 4) {
        tryAt(start, len);
      }
    }

    // 절반 넘게 틀리면 짝을 못 찾은 것으로 본다 (건너뛴 구간)
    if (best.dist / para.length > 0.5) continue;
    totalDist += best.dist;
    totalRef += para.length;
    matched += 1;
    worst.push({
      dist: best.dist,
      len: para.length,
      ref: para.slice(0, 60),
      hyp: hyp.slice(best.start, Math.min(best.end, best.start + 60)),
    });
    cursor = best.end;
  }

  worst.sort((a, b) => b.dist - a.dist);
  return { cer: totalDist / Math.max(1, totalRef), matched, totalRef, worst };
}

function main(): void {
  const raw = readFileSync(REFERENCE, "utf8");
  const refParas = raw
    .split(/\n+/)
    .map((p) => norm(p))
    .filter((p) => p.length >= 25);
  const refChars = refParas.reduce((s, p) => s + p.length, 0);
  console.log(
    `축어 정답지 문단 ${refParas.length}개, ${refChars}자 (녹음 앞 8분가량)\n`,
  );

  for (const c of CANDIDATES) {
    const hyp = norm(readFileSync(c.file, "utf8"));
    const r = alignedCer(refParas, hyp);
    console.log(
      `[${c.label}] CER ${(r.cer * 100).toFixed(1)}%  ` +
        `(짝 찾은 문단 ${r.matched}/${refParas.length}, ${r.totalRef}자)`,
    );
    for (const w of r.worst.slice(0, 3)) {
      console.log(`   오류 ${w.dist}/${w.len}자`);
      console.log(`     정답: ${w.ref}`);
      console.log(`     전사: ${w.hyp}`);
    }
  }
}

main();
