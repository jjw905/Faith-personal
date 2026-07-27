/**
 * 오인식 낱말 보정 추천.
 *
 * 대화기록을 고치지 않는다. 소리는 맞는데 글자가 틀린 곳을 찾아
 * "이 말이었을 수 있다"만 붙인다 (803 국립공원 → 팔공산국립공원).
 * 모델이 뜻을 판단하고, 발음 유사도가 낮은 제안은 서버가 버린다.
 */
import { getOpenAIClient } from "@/lib/stt/openai";
import { estimateStructureUsd, STRUCTURE_MODEL } from "@/lib/stt/pricing";
import { pronunciationSimilarity } from "@/lib/stt/pronunciation";
import type { TranscriptCorrection, TranscriptLine } from "@/types/transcript";

/** 제안을 받아들이는 최소 발음 유사도. 0.82 미만은 다른 말로 본다. */
const MIN_SIMILARITY = 0.82;
/** 회의당 추천 상한. 너무 많으면 읽는 데 방해된다. */
const MAX_SUGGESTIONS = 24;
/** 한 번에 모델에 넣는 대화기록 글자 수. */
const BATCH_CHARS = 6000;

export type TermSuggestion = {
  /** 대화기록 줄 번호 (0부터). */
  lineIndex: number;
  /** 줄 안의 잘못 받은 구간, 원문 그대로. */
  wrong: string;
  /** 추천 낱말. */
  suggestion: string;
  /** 왜 그렇게 보는지 한 구절. */
  reason: string;
  /** 발음 유사도 0~1. */
  similarity: number;
};

export type TermSuggestResult = {
  suggestions: TermSuggestion[];
  usage: {
    model: typeof STRUCTURE_MODEL;
    inputTokens: number;
    outputTokens: number;
    estimatedUsd: number;
  };
};

const SYSTEM = `너는 한국어 회의 STT의 오인식을 찾아내는 검수 모델이다.
대화기록을 고치지 않는다. 잘못 받아썼을 가능성이 큰 낱말만 골라 추천 낱말을 제시한다.

반드시 JSON만 출력:
{ "items": [ { "line": 3, "wrong": "803 국립공원", "suggestion": "팔공산국립공원", "reason": "소리가 같은 국립공원 이름" } ] }

규칙:
- 소리는 맞는데 글자가 틀린 것만 고른다. 고유명사, 기관명, 지명, 법령명, 사람 직함이 주 대상이다.
- wrong은 그 줄에 있는 글자 그대로 옮긴다. 한 글자도 바꾸지 않는다.
- suggestion은 wrong과 소리가 거의 같아야 한다. 뜻만 비슷한 다른 말은 금지.
- 문장을 다듬거나 말투를 고치는 제안 금지. 맞춤법, 띄어쓰기만의 차이도 금지.
- 같은 낱말이 여러 줄에서 틀렸으면 줄마다 각각 넣는다.
- 확신이 없으면 넣지 않는다. 빈 배열이어도 된다.
- 한 회의에서 최대 12개.

예: "803 국립공원" → "팔공산국립공원", "센테 탐방로" → "생태탐방로", "차간" → "차관".`;

type RawItem = {
  line?: number;
  wrong?: string;
  suggestion?: string;
  reason?: string;
};

/**
 * 이미 맞다고 확인된 말은 고치라고 하지 않는다.
 * 화자 실명처럼 다른 근거로 확정한 낱말을 발음만 보고 흔들면 오히려 틀린다.
 */
function isProtected(wrong: string, keep: string[]): boolean {
  const w = wrong.replace(/\s/g, "");
  return keep.some((term) => {
    const t = term.replace(/\s/g, "");
    return t.length >= 2 && (w.includes(t) || t.includes(w));
  });
}

function validate(
  item: RawItem,
  lines: string[],
  offset: number,
  keep: string[],
): TermSuggestion | null {
  const lineIndex = Number(item.line);
  const wrong = String(item.wrong ?? "").trim();
  const suggestion = String(item.suggestion ?? "").trim();
  if (!Number.isInteger(lineIndex) || !wrong || !suggestion) return null;

  const absolute = lineIndex + offset;
  const text = lines[absolute];
  if (!text || !text.includes(wrong)) return null;
  if (wrong === suggestion) return null;
  if (isProtected(wrong, keep)) return null;
  // 띄어쓰기만 다른 것은 오인식이 아니다. 추천으로 띄우면 잔소리가 된다.
  if (wrong.replace(/\s/g, "") === suggestion.replace(/\s/g, "")) return null;
  // 문장 통째 교체 방지
  if (wrong.length > 40 || suggestion.length > 40) return null;
  if (suggestion.length > wrong.length * 2 + 4) return null;

  const similarity = pronunciationSimilarity(wrong, suggestion);
  if (similarity < MIN_SIMILARITY) return null;

  return {
    lineIndex: absolute,
    wrong,
    suggestion,
    reason: String(item.reason ?? "").trim().slice(0, 60),
    similarity,
  };
}

const bare = (s: string) => s.replace(/\s/g, "");

/**
 * 서로 반대로 고치라는 추천을 걷어낸다.
 *
 * 전사가 한 이름을 두 가지로 적으면(임의자, 임미자) 모델은 갈린 것은 알아채지만
 * 어느 쪽이 옳은지는 못 고른다. 그래서 A를 B로, B를 A로 바꾸라고 같이 낸다.
 * 그대로 보이면 맞는 표기를 틀린 쪽으로 고치라고 권하는 꼴이다.
 * 본문에 많이 나온 쪽으로 몰아주고, 수가 같아 못 고르면 둘 다 뺀다.
 */
/**
 * 실제로 바뀌는 낱말만 꺼낸다.
 *
 * 추천 구간은 "임의자 의원입니다."처럼 주변 말을 달고 온다. 구간을 통째로
 * 비교하면 같은 이름을 두고 다투는 것을 알아채지 못한다.
 */
function changedWord(
  wrong: string,
  suggestion: string,
): { from: string; to: string } | null {
  const a = wrong.split(/\s+/).filter(Boolean);
  const b = suggestion.split(/\s+/).filter(Boolean);
  if (a.length !== b.length) return null;
  const diff = a.map((w, i) => (w === b[i] ? -1 : i)).filter((i) => i >= 0);
  if (diff.length !== 1) return null;
  const i = diff[0]!;
  return { from: a[i]!, to: b[i]! };
}

function dropContradictions(
  items: TermSuggestion[],
  lines: string[],
): TermSuggestion[] {
  const cores = items.map((s) => changedWord(s.wrong, s.suggestion));
  const asked = new Set(
    cores.filter(Boolean).map((c) => `${bare(c!.from)}>${bare(c!.to)}`),
  );

  const body = bare(lines.join(" "));
  const countOf = (term: string) =>
    term ? body.split(bare(term)).length - 1 : 0;

  return items.filter((s, i) => {
    const core = cores[i];
    if (!core) return true;
    const reversed = `${bare(core.to)}>${bare(core.from)}`;
    if (!asked.has(reversed)) return true;
    // 서로 반대로 고치라고 한다. 본문에 더 많이 쓰인 표기로만 몰아준다.
    return countOf(core.to) > countOf(core.from);
  });
}

/** 추천을 대화기록 줄에 붙인다. 본문은 그대로 둔다. */
export function attachCorrections(
  lines: TranscriptLine[],
  suggestions: TermSuggestion[],
): TranscriptLine[] {
  if (suggestions.length === 0) return lines;
  const byLine = new Map<number, TranscriptCorrection[]>();
  for (const s of suggestions) {
    const list = byLine.get(s.lineIndex) ?? [];
    list.push({ wrong: s.wrong, suggestion: s.suggestion, reason: s.reason });
    byLine.set(s.lineIndex, list);
  }
  return lines.map((line, index) => {
    const corrections = byLine.get(index);
    return corrections ? { ...line, corrections } : line;
  });
}

/** 대화기록에서 오인식 후보를 찾는다. 원문은 건드리지 않는다. */
export async function suggestTermCorrections(
  lines: string[],
  options: { glossary?: string[]; keepTerms?: string[] } = {},
): Promise<TermSuggestResult> {
  const usable = lines.map((l) => l ?? "");
  const empty: TermSuggestResult = {
    suggestions: [],
    usage: {
      model: STRUCTURE_MODEL,
      inputTokens: 0,
      outputTokens: 0,
      estimatedUsd: 0,
    },
  };
  if (usable.every((l) => !l.trim())) return empty;

  const client = getOpenAIClient();
  const glossary = (options.glossary ?? []).filter(Boolean);
  const keepTerms = (options.keepTerms ?? [])
    .flatMap((t) => t.split(/\s+/))
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  const suggestions: TermSuggestion[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

  let start = 0;
  while (start < usable.length) {
    let end = start;
    let chars = 0;
    while (end < usable.length && chars < BATCH_CHARS) {
      chars += usable[end]!.length + 8;
      end += 1;
    }

    const body = usable
      .slice(start, end)
      .map((text, i) => `${i}: ${text}`)
      .join("\n");

    const res = await client.chat.completions.create({
      model: STRUCTURE_MODEL,
      response_format: { type: "json_object" },
      temperature: 0,
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content:
            (glossary.length
              ? `이 회의에서 쓰는 말: ${glossary.join(", ")}\n\n`
              : "") +
            (keepTerms.length
              ? `이미 맞다고 확인한 말 (고치라고 하지 마라): ${keepTerms.join(", ")}\n\n`
              : "") +
            `대화기록:\n${body}`,
        },
      ],
    });

    inputTokens += res.usage?.prompt_tokens ?? 0;
    outputTokens += res.usage?.completion_tokens ?? 0;

    let parsed: { items?: RawItem[] } = {};
    try {
      parsed = JSON.parse(res.choices[0]?.message?.content || "{}");
    } catch {
      parsed = {};
    }

    for (const item of parsed.items ?? []) {
      const ok = validate(item, usable, start, keepTerms);
      if (ok) suggestions.push(ok);
    }

    start = end;
  }

  // 같은 낱말 반복 추천은 처음 것만 남긴다.
  const seen = new Set<string>();
  const unique = suggestions.filter((s) => {
    const key = `${s.lineIndex}:${s.wrong}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    suggestions: dropContradictions(unique, lines).slice(0, MAX_SUGGESTIONS),
    usage: {
      model: STRUCTURE_MODEL,
      inputTokens,
      outputTokens,
      estimatedUsd: estimateStructureUsd(inputTokens, outputTokens),
    },
  };
}
