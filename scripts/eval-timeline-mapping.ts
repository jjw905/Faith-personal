/**
 * 타임라인 시각 매핑 비교.
 * A) 서버 휴리스틱: dialogue[].startSec로 구간 경계 근사
 * B) 고정 모델(gpt-4o-mini): timeline에 startSec/endSec 직접 산출
 * 기준: STT 원문 문자 위치로 잡은 앵커 시각 (dialogue 시계와 독립)
 *
 * 사용: npx tsx --tsconfig tsconfig.json scripts/eval-timeline-mapping.ts
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env" });
config({ path: ".env.local", override: true });

type Dialogue = { startSec: number; text: string; speaker?: string };
type TimelineItem = {
  title: string;
  speakers?: string[];
  summary?: string;
  kind?: string;
  startSec?: number;
  endSec?: number;
};

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2),
  );
}

function overlapScore(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit += 1;
  return hit / Math.sqrt(A.size * B.size);
}

/** A: dialogue 연속 구간을 타임라인에 최적 할당 후 startSec로 경계. */
function mapByDialogue(
  items: TimelineItem[],
  dialogue: Dialogue[],
  durationSec: number,
): Array<{ title: string; startSec: number; endSec: number }> {
  const n = items.length;
  const m = dialogue.length;
  if (n === 0) return [];
  if (m === 0) {
    const span = durationSec / n;
    return items.map((it, i) => ({
      title: it.title,
      startSec: i * span,
      endSec: i === n - 1 ? durationSec : (i + 1) * span,
    }));
  }

  const score = Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, j) => {
      const q = `${items[i]!.title} ${items[i]!.summary || ""}`;
      return overlapScore(q, dialogue[j]!.text);
    }),
  );

  // DP: dp[i][j] = item 0..i-1 을 dialogue 0..j-1 에 배치한 최대 점수
  // cut[i][j] = item i-1 시작 dialogue index
  const NEG = -1e18;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(NEG),
  );
  const cut: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0),
  );
  dp[0]![0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = i; j <= m; j++) {
      // item i-1 covers dialogue [k, j)
      for (let k = i - 1; k < j; k++) {
        if (dp[i - 1]![k]! <= NEG / 2) continue;
        let seg = 0;
        for (let t = k; t < j; t++) seg += score[i - 1]![t]!;
        // 짧은 구간 페널티 완화: 길이 보정
        seg = seg / Math.max(1, j - k) + seg * 0.15;
        const val = dp[i - 1]![k]! + seg;
        if (val > dp[i]![j]!) {
          dp[i]![j] = val;
          cut[i]![j] = k;
        }
      }
    }
  }

  // backtrack ends at m
  const starts: number[] = Array(n).fill(0);
  let j = m;
  for (let i = n; i >= 1; i--) {
    const k = cut[i]![j]!;
    starts[i - 1] = k;
    j = k;
  }

  const out: Array<{ title: string; startSec: number; endSec: number }> = [];
  for (let i = 0; i < n; i++) {
    const a = starts[i]!;
    const b = i + 1 < n ? starts[i + 1]! : m;
    const startSec = dialogue[a]?.startSec ?? 0;
    const endSec =
      i === n - 1
        ? durationSec
        : (dialogue[b]?.startSec ?? durationSec);
    out.push({
      title: items[i]!.title,
      startSec: Math.max(0, Math.min(durationSec, startSec)),
      endSec: Math.max(startSec, Math.min(durationSec, endSec)),
    });
  }
  return out;
}

function evenSplit(
  items: TimelineItem[],
  durationSec: number,
): Array<{ title: string; startSec: number; endSec: number }> {
  const n = Math.max(1, items.length);
  const span = durationSec / n;
  return items.map((it, i) => ({
    title: it.title,
    startSec: i * span,
    endSec: i === n - 1 ? durationSec : (i + 1) * span,
  }));
}

/** 안건 전환 문구 → 원문 문자비율 초 (발화속도 균등 가정). */
const GOLD_PHRASES_BY_MEETING: Record<string, string[]> = {
  "mtg-up-8031660d": [
    "의석을 정돈",
    "소위원회의 심사보고를 듣겠",
    "먼저 환경부 소관",
    "다음으로 고용노동부",
    "의결하도록 하겠",
  ],
  "mtg-up-9911f7ab": [
    "의석을 정돈",
    "소위원회의 심사보고를 듣겠",
    "먼저 환경부 소관",
    "다음으로 고용노동부",
    "의결하도록 하겠",
  ],
};

function referenceByGoldPhrases(
  meetingId: string,
  items: TimelineItem[],
  rawText: string,
  dialogue: Dialogue[],
  durationSec: number,
): {
  byChar: Array<{ title: string; startSec: number; endSec: number }>;
  byDialogue: Array<{ title: string; startSec: number; endSec: number }>;
} {
  const phrases = GOLD_PHRASES_BY_MEETING[meetingId];
  if (!phrases || phrases.length !== items.length) {
    // fallback: title token scan
    const byChar = items.map((it, i) => {
      const span = durationSec / items.length;
      return {
        title: it.title,
        startSec: i * span,
        endSec: i === items.length - 1 ? durationSec : (i + 1) * span,
      };
    });
    return { byChar, byDialogue: byChar };
  }

  const len = Math.max(1, rawText.length);
  const charStarts: number[] = [];
  const dlgStarts: number[] = [];
  let cursor = 0;
  for (const p of phrases) {
    const idx = rawText.indexOf(p, cursor);
    const at = idx >= 0 ? idx : cursor;
    charStarts.push((at / len) * durationSec);
    const hit = dialogue.find((d) => d.text.includes(p));
    dlgStarts.push(hit?.startSec ?? (at / len) * durationSec);
    cursor = Math.max(cursor, at + 1);
  }

  const pack = (starts: number[]) =>
    items.map((it, i) => {
      const startSec = starts[i]!;
      const endSec =
        i === items.length - 1 ? durationSec : starts[i + 1]!;
      return {
        title: it.title,
        startSec,
        endSec: Math.max(startSec + 1, endSec),
      };
    });

  return { byChar: pack(charStarts), byDialogue: pack(dlgStarts) };
}

function mae(
  pred: Array<{ startSec: number }>,
  ref: Array<{ startSec: number }>,
): number {
  const n = Math.min(pred.length, ref.length);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(pred[i]!.startSec - ref[i]!.startSec);
  return s / n;
}

function formatClock(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

async function modelTimelineBounds(
  rawText: string,
  durationSec: number,
  items: TimelineItem[],
): Promise<Array<{ title: string; startSec: number; endSec: number }>> {
  const { getOpenAIClient } = await import("../src/lib/stt/openai");
  const { STRUCTURE_MODEL } = await import("../src/lib/stt/pricing");
  const client = getOpenAIClient();

  const titles = items.map((t, i) => `${i + 1}. ${t.title}`).join("\n");
  const res = await client.chat.completions.create({
    model: STRUCTURE_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "너는 회의 타임라인 시각을 잡는 모델이다. JSON만 출력한다. " +
          "주어진 구간 제목 순서와 개수를 유지하고, 각 구간에 startSec/endSec(초)를 부여한다. " +
          "startSec는 0부터 durationSec까지 비감소, endSec > startSec, 마지막 endSec는 durationSec.",
      },
      {
        role: "user",
        content:
          `녹음 길이: ${Math.round(durationSec)}초\n` +
          `타임라인 구간(순서 고정):\n${titles}\n\n` +
          `STT:\n${rawText}\n\n` +
          `출력 JSON: { "timeline": [ { "title": "...", "startSec": 0, "endSec": 10 } ] }`,
      },
    ],
  });

  const usage = res.usage;
  const raw = res.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as {
    timeline?: Array<{ title?: string; startSec?: number; endSec?: number }>;
  };
  const rows = Array.isArray(parsed.timeline) ? parsed.timeline : [];
  const out = items.map((it, i) => {
    const r = rows[i];
    let startSec =
      typeof r?.startSec === "number" && Number.isFinite(r.startSec)
        ? r.startSec
        : (i * durationSec) / items.length;
    let endSec =
      typeof r?.endSec === "number" && Number.isFinite(r.endSec)
        ? r.endSec
        : ((i + 1) * durationSec) / items.length;
    startSec = Math.max(0, Math.min(durationSec, startSec));
    endSec = Math.max(startSec + 1, Math.min(durationSec, endSec));
    return { title: it.title, startSec, endSec };
  });
  // enforce non-decreasing starts
  for (let i = 1; i < out.length; i++) {
    if (out[i]!.startSec < out[i - 1]!.startSec) {
      out[i]!.startSec = out[i - 1]!.startSec;
    }
  }
  out[out.length - 1]!.endSec = durationSec;

  return Object.assign(out, {
    _usage: {
      input: usage?.prompt_tokens ?? 0,
      output: usage?.completion_tokens ?? 0,
    },
  });
}

function printTable(
  label: string,
  rows: Array<{ title: string; startSec: number; endSec: number }>,
) {
  console.log(`\n=== ${label} ===`);
  for (const r of rows) {
    console.log(
      `${formatClock(r.startSec)}-${formatClock(r.endSec)}  ${r.title}`,
    );
  }
}

async function evalMeeting(path: string) {
  const row = JSON.parse(readFileSync(path, "utf8")) as {
    id: string;
    rawText?: string;
    meeting: { title: string; duration?: string };
    semantic?: {
      timeline?: TimelineItem[];
      dialogue?: Dialogue[];
    };
  };

  const rawText = row.rawText || "";
  const items = (row.semantic?.timeline || []).filter((t) => t.title);
  const dialogue = row.semantic?.dialogue || [];
  const durationSec = Math.max(
    ...dialogue.map((d) => d.startSec),
    420,
  );

  console.log("\n########################################");
  console.log("meeting", row.id, row.meeting.title);
  console.log(
    `durationSec≈${durationSec}, timeline=${items.length}, dialogue=${dialogue.length}, chars=${rawText.length}`,
  );

  const { byChar: refChar, byDialogue: refDlg } = referenceByGoldPhrases(
    row.id,
    items,
    rawText,
    dialogue,
    durationSec,
  );
  const even = evenSplit(items, durationSec);
  const heur = mapByDialogue(items, dialogue, durationSec);
  const model = await modelTimelineBounds(rawText, durationSec, items);
  const usage = (model as { _usage?: { input: number; output: number } })
    ._usage;

  printTable("기준G1 전환문구+문자비율", refChar);
  printTable("기준G2 전환문구+dialogue초", refDlg);
  printTable("균등분할(현재)", even);
  printTable("A 휴리스틱(dialogue 매핑)", heur);
  printTable("B 고정모델(startSec/endSec)", model);

  function report(tag: string, ref: typeof refChar) {
    console.log(`\n--- 시작시각 MAE vs ${tag} (초) ---`);
    console.log(`균등분할:   ${mae(even, ref).toFixed(1)}`);
    console.log(`A 휴리스틱: ${mae(heur, ref).toFixed(1)}`);
    console.log(`B 고정모델: ${mae(model, ref).toFixed(1)}`);
  }
  report("G1 문자비율", refChar);
  report("G2 dialogue초", refDlg);
  console.log(`\nA vs B 상호 MAE: ${mae(heur, model).toFixed(1)}s`);
  if (usage) {
    console.log(`B 토큰: input=${usage.input} output=${usage.output}`);
  }

  // 내용 정합: 각 구간 창에 전환 문구가 들어있는지
  const phrases = GOLD_PHRASES_BY_MEETING[row.id] || [];
  function phraseHit(
    rows: Array<{ startSec: number; endSec: number }>,
  ): number {
    if (phrases.length === 0) return 0;
    let hit = 0;
    for (let i = 0; i < phrases.length; i++) {
      const p = phrases[i]!;
      const r = rows[i]!;
      const inWin = dialogue.some(
        (d) =>
          d.text.includes(p) &&
          d.startSec >= r.startSec - 2 &&
          d.startSec <= r.endSec + 2,
      );
      // 문자비율 기준도 보조
      const idx = rawText.indexOf(p);
      const sec = idx >= 0 ? (idx / rawText.length) * durationSec : -1;
      const byChar =
        sec >= r.startSec - 5 && sec <= r.endSec + 5;
      if (inWin || byChar) hit += 1;
    }
    return hit / phrases.length;
  }

  console.log("\n--- 전환문구가 해당 구간 창에 포함되는 비율 ---");
  console.log(`균등분할:   ${phraseHit(even).toFixed(2)}`);
  console.log(`A 휴리스틱: ${phraseHit(heur).toFixed(2)}`);
  console.log(`B 고정모델: ${phraseHit(model).toFixed(2)}`);

  return {
    id: row.id,
    maeEvenG1: mae(even, refChar),
    maeHeurG1: mae(heur, refChar),
    maeModelG1: mae(model, refChar),
    maeEvenG2: mae(even, refDlg),
    maeHeurG2: mae(heur, refDlg),
    maeModelG2: mae(model, refDlg),
    maeHeurVsModel: mae(heur, model),
    hitEven: phraseHit(even),
    hitHeur: phraseHit(heur),
    hitModel: phraseHit(model),
  };
}

async function main() {
  const files = [
    join(process.cwd(), ".data/user-meetings/mtg-up-8031660d.json"),
    join(process.cwd(), ".data/user-meetings/mtg-up-9911f7ab.json"),
  ];

  type EvalResult = Awaited<ReturnType<typeof evalMeeting>>;
  const results: EvalResult[] = [];
  for (const f of files) {
    try {
      results.push(await evalMeeting(f));
    } catch (e) {
      console.error("fail", f, e);
    }
  }

  console.log("\n########################################");
  console.log("평균 요약");
  const avg = (k: keyof EvalResult) =>
    results.reduce((s, r) => s + Number(r[k]), 0) / Math.max(1, results.length);
  console.log(`MAE vs G1(문자)  균등 ${avg("maeEvenG1").toFixed(1)} / A ${avg("maeHeurG1").toFixed(1)} / B ${avg("maeModelG1").toFixed(1)}`);
  console.log(`MAE vs G2(dlg초) 균등 ${avg("maeEvenG2").toFixed(1)} / A ${avg("maeHeurG2").toFixed(1)} / B ${avg("maeModelG2").toFixed(1)}`);
  console.log(`전환문구 hit     균등 ${avg("hitEven").toFixed(2)} / A ${avg("hitHeur").toFixed(2)} / B ${avg("hitModel").toFixed(2)}`);
  console.log(`A↔B 상호 MAE     ${avg("maeHeurVsModel").toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
