/**
 * 용어를 알고 있으면 CER이 어디까지 내려가는지 잰다.
 *
 * 지금 틀리는 자리는 거의 전부 그 분야 단어다. 씨마늘을 '시방을', 난축맛돈을
 * '난춘맛돈'으로 받는 식이다. 소리는 거의 같으니, 쓰일 만한 말을 미리 알고
 * 있으면 받아적은 뒤에 되돌릴 수 있다.
 *
 * 여기서는 회의 자료를 첨부해 용어를 다 아는 상황을 흉내 낸다. 정답지에서
 * 낱말을 뽑아 후보로 쓰고, 발음이 가까운 자리만 바꾼 뒤 다시 잰다. 이 방법에
 * 투자할 값어치가 있는지 판단할 천장을 얻는 게 목적이다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-term-correction.ts brief-rda
 */
import { config } from "dotenv";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });
config();

import { getOpenAIClient } from "../src/lib/stt/openai";
import { pronunciationSimilarity, toJamo } from "../src/lib/stt/pronunciation";
import { alignedCer, normalize } from "./lib/cer";

const DIR = ".data/stt-bench/fixtures";
const ROLE_TAG = /^\[[^\]]{1,6}\]\s*/;
const INAUDIBLE = /\*{2,}/;

/** 소리가 이만큼 닮아야 같은 말을 잘못 받은 것으로 본다. */
const MIN_SIMILARITY = 0.78;
/** 이미 맞게 적힌 말은 건드리지 않는다. */
const EXACT = 1;
/**
 * 짧은 말은 손대지 않는다.
 *
 * '이런'과 '1건'처럼 두세 글자짜리는 소리가 조금만 겹쳐도 닮은 값이 크게
 * 나온다. 그대로 두면 멀쩡한 말을 엉뚱한 용어로 바꾼다.
 */
const MIN_JAMO = 7;
/** 모델이 띄어 쓰는 자리가 자료와 다르다. 몇 낱말을 묶어서도 견준다. */
const MAX_WORDS = 3;

const PARTICLES = [
  "으로써", "에서는", "에게서", "으로는", "이라는", "라는",
  "에서", "에게", "으로", "부터", "까지", "보다", "처럼", "마다",
  "이나", "이란", "라고", "고요",
  "은", "는", "이", "가", "을", "를", "에", "의", "와", "과", "도", "만", "로",
];

const STOP = new Set([
  "그리고", "그래서", "하지만", "그러나", "때문에", "위해", "대해", "관련",
  "있습니다", "합니다", "했습니다", "됩니다", "드립니다", "말씀", "생각",
  "경우", "내용", "부분", "정도", "우리", "저희", "여러분", "지금", "오늘",
  "이번", "다음", "먼저", "또한", "특히", "모두", "많이", "조금",
]);

function stripParticle(word: string): string {
  for (const p of PARTICLES) {
    if (word.length > p.length + 1 && word.endsWith(p)) {
      return word.slice(0, -p.length);
    }
  }
  return word;
}

function clean(word: string): string {
  return word.replace(/[^0-9A-Za-z가-힣]/g, "");
}

/**
 * 회의 자료에 실려 있을 만한 말을 모은다.
 *
 * 실제 제품에서는 보관함에 붙인 문서, 안건, 참석자 이름, 지난 회의에서 고친
 * 기록이 이 자리를 채운다. 여기서는 정답지로 그 상황을 흉내 낸다.
 */
function buildTerms(reference: string): string[] {
  const terms = new Set<string>();
  for (const rawWord of reference.split(/\s+/)) {
    const word = clean(rawWord);
    if (!word) continue;
    for (const form of [word, stripParticle(word)]) {
      if (form.length < 2 || form.length > 10) continue;
      if (STOP.has(form)) continue;
      if (!/[가-힣]/.test(form)) continue;
      terms.add(form);
    }
  }
  return [...terms];
}

type Term = { text: string; jamo: string };

/** 소리가 가장 가까운 후보를 찾는다. 없으면 null. */
function bestMatch(phrase: string, terms: Term[]): { term: string; score: number } | null {
  const jamo = toJamo(phrase);
  if (jamo.length < MIN_JAMO) return null;

  let best: { term: string; score: number } | null = null;
  for (const t of terms) {
    // 길이가 크게 다르면 볼 것도 없다. 먼저 걸러 계산을 아낀다.
    if (Math.abs(t.jamo.length - jamo.length) > 3) continue;
    if (t.text === phrase) return null; // 이미 맞다
    const score = pronunciationSimilarity(phrase, t.text);
    if (score >= MIN_SIMILARITY && (!best || score > best.score)) {
      best = { term: t.text, score };
    }
  }
  return best && best.score < EXACT ? best : null;
}

/** 전사에서 소리가 후보와 겹치는 자리를 바꾼다. */
function correct(hypothesis: string, termList: string[]) {
  const terms: Term[] = termList.map((t) => ({ text: t, jamo: toJamo(t) }));
  const exact = new Set(termList);
  const tokens = [...hypothesis.matchAll(/\S+/g)];
  const changes: Array<{ from: string; to: string; score: number }> = [];

  const edits: Array<{ start: number; end: number; text: string }> = [];
  let i = 0;
  while (i < tokens.length) {
    let applied = false;
    // 긴 묶음부터 본다. '난춘 맛돈'처럼 갈라 적은 자리를 통째로 잡기 위해서다.
    for (let n = Math.min(MAX_WORDS, tokens.length - i); n >= 1; n--) {
      const span = tokens.slice(i, i + n);
      // 문장이 끝난 자리를 넘어 묶으면 '내용입니다. 두 번째'가 한 덩어리가 된다.
      if (span.slice(0, -1).some((t) => /[.!?]$/.test(t[0]))) continue;

      const phrase = clean(span.map((t) => t[0]).join(""));
      if (phrase.length < 2) continue;
      if (exact.has(phrase) || exact.has(stripParticle(phrase))) break;

      const hit = bestMatch(phrase, terms);
      if (!hit) continue;
      // 한쪽이 다른 쪽에 그대로 들어 있으면 잘못 들은 게 아니라 글자를 지우거나
      // 붙이는 것뿐이다. '배 생산자'를 '생산자'로 만드는 짓을 막는다.
      if (phrase.includes(hit.term) || hit.term.includes(phrase)) continue;

      const start = span[0]!.index;
      const last = span[n - 1]!;
      edits.push({ start, end: last.index + last[0].length, text: hit.term });
      changes.push({ from: phrase, to: hit.term, score: hit.score });
      i += n;
      applied = true;
      break;
    }
    if (!applied) i += 1;
  }

  let text = hypothesis;
  for (const e of [...edits].reverse()) {
    text = text.slice(0, e.start) + e.text + text.slice(e.end);
  }
  return { text, changes };
}

const EXTRACT_SYSTEM = `회의 자료에서 음성 인식이 틀리기 쉬운 말만 골라낸다.

고른다: 기관명, 사업명, 제품명, 품종명, 사람 이름, 지명, 전문 분야에서만 쓰는 말.
버린다: 일상적으로 흔히 쓰는 말, 서술어, 숫자, 한 글자.

JSON만 답한다. {"terms": ["...", "..."]}`;

/**
 * 자료에서 쓸 만한 용어만 뽑는다.
 *
 * 자료에 나오는 낱말을 전부 후보로 넣으면 흔한 말끼리 소리가 겹쳐 멀쩡한
 * 문장을 망가뜨린다. 틀릴 만한 말만 남겨야 한다. 실제 제품에서는 보관함에
 * 붙인 문서와 참석자 명단을 이 자리에 넣는다.
 */
async function llmTerms(alias: string, reference: string): Promise<string[]> {
  const cache = join(DIR, `${alias}.terms.json`);
  if (existsSync(cache)) {
    return JSON.parse(readFileSync(cache, "utf8")) as string[];
  }

  const client = getOpenAIClient();
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: EXTRACT_SYSTEM },
      { role: "user", content: reference.slice(0, 24000) },
    ],
  });
  const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as {
    terms?: string[];
  };
  const terms = (parsed.terms ?? []).filter((t) => t.length >= 2 && t.length <= 12);
  writeFileSync(cache, JSON.stringify(terms, null, 2), "utf8");
  return terms;
}

function refParagraphs(reference: string): string[] {
  return reference
    .split("\n")
    .map((line) => line.replace(ROLE_TAG, ""))
    .filter((line) => !INAUDIBLE.test(line))
    .map(normalize)
    .filter((p) => p.length >= 25);
}

async function main(): Promise<void> {
  const aliases = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const detail = process.argv.includes("--detail");

  console.log("\n브리핑           낱말전부        추린용어");
  console.log("               개수    CER      개수    CER");
  console.log("─".repeat(52));

  for (const alias of aliases.length ? aliases : ["brief-rda"]) {
    const reference = readFileSync(join(DIR, `${alias}.reference.txt`), "utf8");
    const hypothesis = readFileSync(join(DIR, `${alias}.hypothesis.txt`), "utf8");
    const paras = refParagraphs(reference);

    const all = buildTerms(reference);
    const picked = await llmTerms(alias, reference);
    const wide = correct(hypothesis, all);
    const tight = correct(hypothesis, picked);

    const base = alignedCer(paras, normalize(hypothesis)).cer;
    const wideCer = alignedCer(paras, normalize(wide.text)).cer;
    const tightCer = alignedCer(paras, normalize(tight.text)).cer;

    console.log(
      `${alias.replace("brief-", "").padEnd(11)}` +
        `${String(all.length).padStart(6)}${`${(wideCer * 100).toFixed(1)}%`.padStart(8)}` +
        `${String(picked.length).padStart(9)}${`${(tightCer * 100).toFixed(1)}%`.padStart(8)}` +
        `   (원래 ${(base * 100).toFixed(1)}%)`,
    );

    if (detail) {
      for (const c of tight.changes) console.log(`     ${c.from} → ${c.to}`);
    }
  }
}

void main();
