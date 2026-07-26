import { getOpenAIClient } from "@/lib/stt/openai";
import {
  STRUCTURE_MODEL,
  estimateStructureUsd,
} from "@/lib/stt/pricing";

export type StructureUsage = {
  model: typeof STRUCTURE_MODEL;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedUsd: number;
};

export type SemanticTimelineItem = {
  title: string;
  speakers: string[];
  summary: string;
  /** 모델이 고른 구간 종류. */
  kind?: string;
};

export type SemanticAction = {
  owner: string;
  task: string;
  due: string;
};

/** 화자별 기여. 담당·역할·무엇을 말했는지. */
export type SemanticSpeakerContribution = {
  name: string;
  summary: string;
  tags: string[];
};

/** 모델이 나눈 대화기록 한 줄. */
export type SemanticDialogueLine = {
  startSec: number;
  text: string;
  /** 화자 라벨. 분리 없으면 생략. */
  speaker?: string;
};

export type SemanticStructure = {
  overallSummary: string;
  /** 회의 내용 핵심 주제 키워드 (목록 표시용). */
  keywords: string[];
  timeline: SemanticTimelineItem[];
  decisions: string[];
  actions: SemanticAction[];
  /** 발화자별 한 줄 요약·태그. */
  speakers: SemanticSpeakerContribution[];
  dialogue: SemanticDialogueLine[];
};

export type SemanticStructureResult = {
  structure: SemanticStructure;
  usage: StructureUsage;
};

const STRUCTURE_SYSTEM = `너는 회의록 상품 파이프라인의 정리 모델이다.
입력은 STT 원문이다. 요약·타임라인·결정·액션·발화자 기여·대화기록·주제 키워드를 한 JSON으로 완성한다.

반드시 JSON만 출력:
{
  "overallSummary": "회의 전체 요약 2~4문장",
  "keywords": ["핵심주제1", "핵심주제2", "핵심주제3"],
  "timeline": [
    { "title": "구간 제목", "speakers": ["화자 A"], "summary": "무엇을 말했는지", "kind": "agenda" }
  ],
  "decisions": ["결정·의결·합의 내용"],
  "actions": [
    { "owner": "화자 A", "task": "할 일", "due": "기한(없으면 빈 문자열)" }
  ],
  "speakers": [
    {
      "name": "화자 A",
      "summary": "이 사람이 한 일·발언을 한 문장으로",
      "tags": ["역할", "주제"]
    }
  ],
  "dialogue": [
    { "startSec": 0, "speaker": "화자 A", "text": "발화 한 단위(원문 유지)" }
  ]
}

규칙:
- overallSummary: 회의를 일상 말투로 2~3문장. '~했습니다' 딱딱한 보고체 남발 금지. 예: '추가경정예산안을 심사해 가결했습니다. 고용보험·임금채권 관련 계획 변경도 같이 통과됐습니다.'
- overallSummary에 '결정:', '액션:' 같은 구역 라벨을 넣지 않는다. 결정·액션은 아래 배열만 쓴다.
- keywords: 회의에서 다룬 핵심 주제 3~5개. 명사·짧은 구. 예: '추가경정예산', '고용보험', '마스킹 규칙'.
- keywords 금지: STT, 업로드, 요약, 타임라인, 처리중, AI, 화자분리, diarize, 녹음, 변환 등 파이프라인·상태 단어.
- timeline: 시간순, 5개 내외. speakers는 그 구간에 말한 화자 라벨(빠짐없이).
- timeline.kind는 반드시 다음 중 하나: agenda(안건), discussion(논의), decision(결정), action(후속), risk(주의), report(보고), vote(표결). 내용에 맞게 모델이 고른다.
- decisions / actions: 각각 항목 배열. 없으면 빈 배열.
- speakers: 등장 화자마다 1행. summary는 담당·핵심 발언을 짧게. tags는 1~3개.
- dialogue: 문장, 안건 전환 기준으로 순서대로 나눈다. text는 원문 유지, 요약, 의역, 생략 금지.
- dialogue는 STT 원문 전체를 처음부터 끝까지 덮어야 한다. 중간을 건너뛰거나 뒤를 자르지 마라. dialogue text를 모두 이으면 원문과 거의 같은 분량이 되어야 한다.
- dialogue.startSec는 0부터 durationSec까지 흐름에 맞게 증가(초). 대략값이어도 된다. 서버가 STT 실측 시각으로 반드시 덮어쓴다. 실측이 없으면 파이프라인이 실패한다.
- STT에 [A]/Speaker A/화자 A 등 화자 라벨이 있으면 name·speakers·dialogue.speaker를 "화자 A" 형식으로 맞춘다.
- 화자 분리가 없으면 speakers는 [{ "name": "발화", "summary": "...", "tags": [...] }], timeline speakers는 ["발화"], dialogue.speaker는 넣지 않는다.`;

function normalizeSpeakerName(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (t === "발화") return "발화";
  if (t.startsWith("화자")) return t;
  const m = t.match(/^(?:speaker\s*)?([A-Za-z0-9]+)$/i);
  if (m) return `화자 ${m[1].toUpperCase()}`;
  return t;
}

/**
 * 한 번에 넘길 STT 글자 수 상한.
 * 대화기록은 원문을 그대로 다시 뱉어야 해서 입력이 길면 출력 한도에 걸려
 * 뒷부분이 통째로 사라진다. 넘으면 구간을 나눠 처리한다.
 */
const STRUCTURE_MAX_INPUT_CHARS = 4500;

/** 줄 경계를 지키며 상한 이하로 자른다. */
function splitForStructure(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let buf = "";
  for (const line of text.split(/\n+/)) {
    for (const piece of splitLine(line, limit)) {
      if (buf.length + piece.length + 1 > limit && buf) {
        out.push(buf);
        buf = "";
      }
      buf = buf ? `${buf}\n${piece}` : piece;
    }
  }
  if (buf) out.push(buf);
  return out;
}

/** 한 줄이 상한을 넘으면 문장 끝에서 다시 자른다. */
function splitLine(line: string, limit: number): string[] {
  if (line.length <= limit) return [line];
  const out: string[] = [];
  let buf = "";
  for (const sentence of line.split(/(?<=[.?!])\s+/)) {
    let rest = sentence;
    while (rest.length > limit) {
      out.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
    if (buf.length + rest.length + 1 > limit && buf) {
      out.push(buf);
      buf = "";
    }
    buf = buf ? `${buf} ${rest}` : rest;
  }
  if (buf) out.push(buf);
  return out;
}

type RawStructure = Partial<SemanticStructure> & {
  dialogue?: Array<{ startSec?: number; text?: string; speaker?: string }>;
  speakers?: Array<{ name?: string; summary?: string; tags?: string[] }>;
};

type StructureCall = {
  parsed: RawStructure;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  truncated: boolean;
};

async function callStructureModel(params: {
  sttText: string;
  durationSec: number;
  partIndex?: number;
  partCount?: number;
}): Promise<StructureCall> {
  const client = getOpenAIClient();
  const partNote =
    params.partCount && params.partCount > 1
      ? `이 입력은 회의 STT의 ${(params.partIndex ?? 0) + 1}/${params.partCount} 구간이다. ` +
        `이 구간에 실제로 나온 내용만 담아라. 앞뒤 구간을 추측해 채우지 마라.\n`
      : "";

  const res = await client.chat.completions.create({
    model: STRUCTURE_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: STRUCTURE_SYSTEM },
      {
        role: "user",
        content:
          `녹음 길이: ${Math.max(1, Math.round(params.durationSec))}초\n` +
          partNote +
          `다음 STT로 회의록 상품 JSON을 완성하라.\n\n${params.sttText}`,
      },
    ],
  });

  const choice = res.choices[0];
  const raw = choice?.message?.content || "{}";
  let parsed: RawStructure;
  try {
    parsed = JSON.parse(raw) as RawStructure;
  } catch {
    parsed = {};
  }

  const inputTokens = res.usage?.prompt_tokens ?? 0;
  const outputTokens = res.usage?.completion_tokens ?? 0;
  return {
    parsed,
    inputTokens,
    outputTokens,
    totalTokens: res.usage?.total_tokens ?? inputTokens + outputTokens,
    truncated: choice?.finish_reason === "length",
  };
}

/** 구간별 요약을 하나의 전체 요약, 키워드로 합친다. */
async function callSummaryMerge(params: {
  summaries: string[];
  durationSec: number;
}): Promise<StructureCall> {
  const client = getOpenAIClient();
  const res = await client.chat.completions.create({
    model: STRUCTURE_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          `너는 회의록 상품 파이프라인의 정리 모델이다. 구간별 요약을 받아 회의 전체 요약과 주제 키워드를 만든다.\n` +
          `반드시 JSON만 출력: { "overallSummary": "2~3문장", "keywords": ["주제1", "주제2"] }\n` +
          `- overallSummary는 일상 말투 2~3문장. '결정:', '액션:' 같은 라벨 금지.\n` +
          `- keywords는 회의 핵심 주제 3~5개. 명사나 짧은 구.\n` +
          `- STT, 업로드, 요약, 타임라인, 처리중, AI, 화자분리, 녹음 같은 파이프라인 단어 금지.`,
      },
      {
        role: "user",
        content:
          `녹음 길이: ${Math.max(1, Math.round(params.durationSec))}초\n` +
          `구간 요약:\n${params.summaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      },
    ],
  });

  const raw = res.choices[0]?.message?.content || "{}";
  let parsed: RawStructure;
  try {
    parsed = JSON.parse(raw) as RawStructure;
  } catch {
    parsed = {};
  }
  const inputTokens = res.usage?.prompt_tokens ?? 0;
  const outputTokens = res.usage?.completion_tokens ?? 0;
  return {
    parsed,
    inputTokens,
    outputTokens,
    totalTokens: res.usage?.total_tokens ?? inputTokens + outputTokens,
    truncated: res.choices[0]?.finish_reason === "length",
  };
}

/** 구간별 결과를 이어붙인다. 내용은 고치지 않고 순서대로 합치기만 한다. */
function concatRaw(parts: RawStructure[]): RawStructure {
  const merged: RawStructure = {
    overallSummary: "",
    keywords: [],
    timeline: [],
    decisions: [],
    actions: [],
    speakers: [],
    dialogue: [],
  };
  const seenSpeaker = new Map<string, { summary?: string; tags?: string[] }>();

  for (const p of parts) {
    if (Array.isArray(p.timeline)) merged.timeline!.push(...p.timeline);
    if (Array.isArray(p.decisions)) merged.decisions!.push(...p.decisions);
    if (Array.isArray(p.actions)) merged.actions!.push(...p.actions);
    if (Array.isArray(p.dialogue)) merged.dialogue!.push(...p.dialogue);
    if (Array.isArray(p.keywords)) merged.keywords!.push(...p.keywords);
    for (const s of p.speakers ?? []) {
      const name = (s?.name || "").trim();
      if (!name) continue;
      const prev = seenSpeaker.get(name);
      if (!prev) {
        seenSpeaker.set(name, { summary: s.summary, tags: s.tags });
      } else if (!prev.summary && s.summary) {
        prev.summary = s.summary;
      }
    }
  }
  merged.speakers = [...seenSpeaker.entries()].map(([name, v]) => ({
    name,
    summary: v.summary ?? "",
    tags: v.tags ?? [],
  }));
  return merged;
}

export async function buildSemanticStructure(
  sttText: string,
  durationSec: number,
): Promise<SemanticStructureResult> {
  const dur = Math.max(1, Math.round(durationSec));
  const chunks = splitForStructure(sttText, STRUCTURE_MAX_INPUT_CHARS);

  const calls: StructureCall[] = [];
  for (let i = 0; i < chunks.length; i++) {
    calls.push(
      await callStructureModel({
        sttText: chunks[i]!,
        durationSec: dur,
        partIndex: i,
        partCount: chunks.length,
      }),
    );
  }

  let parsed: RawStructure;
  if (calls.length === 1) {
    parsed = calls[0]!.parsed;
  } else {
    parsed = concatRaw(calls.map((c) => c.parsed));
    const summaries = calls
      .map((c) => (c.parsed.overallSummary || "").trim())
      .filter(Boolean);
    if (summaries.length > 0) {
      const merge = await callSummaryMerge({ summaries, durationSec: dur });
      calls.push(merge);
      parsed.overallSummary = merge.parsed.overallSummary || summaries[0]!;
      if (Array.isArray(merge.parsed.keywords)) {
        parsed.keywords = merge.parsed.keywords;
      }
    }
  }

  if (calls.some((c) => c.truncated) && (parsed.dialogue?.length ?? 0) === 0) {
    throw new Error(
      "구조화 응답이 잘렸습니다. 대화기록을 만들지 못해 중단합니다.",
    );
  }

  const inputTokens = calls.reduce((s, c) => s + c.inputTokens, 0);
  const outputTokens = calls.reduce((s, c) => s + c.outputTokens, 0);
  const totalTokens = calls.reduce((s, c) => s + c.totalTokens, 0);
  const usage: StructureUsage = {
    model: STRUCTURE_MODEL,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedUsd: estimateStructureUsd(inputTokens, outputTokens),
  };

  const dialogueRaw = Array.isArray(parsed.dialogue) ? parsed.dialogue : [];
  let cursor = 0;
  const dialogue: SemanticDialogueLine[] = dialogueRaw
    .map((d) => {
      const text = (d?.text || "").trim();
      if (!text) return null;
      let startSec =
        typeof d?.startSec === "number" && Number.isFinite(d.startSec)
          ? Math.max(0, Math.min(dur, d.startSec))
          : cursor;
      if (startSec < cursor) startSec = cursor;
      cursor = startSec;
      const speaker = normalizeSpeakerName(d?.speaker || "");
      return {
        startSec,
        text,
        ...(speaker ? { speaker } : {}),
      };
    })
    .filter((x): x is SemanticDialogueLine => x !== null);

  const speakers: SemanticSpeakerContribution[] = Array.isArray(parsed.speakers)
    ? parsed.speakers
        .map((s) => {
          const name = normalizeSpeakerName(s?.name || "");
          if (!name) return null;
          const tags = Array.isArray(s?.tags)
            ? s.tags.map(String).map((t) => t.trim()).filter(Boolean).slice(0, 3)
            : [];
          return {
            name,
            summary: (s?.summary || "").trim(),
            tags,
          };
        })
        .filter((x): x is SemanticSpeakerContribution => x !== null)
    : [];

  const structure: SemanticStructure = {
    overallSummary: (parsed.overallSummary || "").trim() || "요약 없음",
    keywords: [],
    timeline: Array.isArray(parsed.timeline)
      ? parsed.timeline.map((t) => ({
          title: (t?.title || "구간").trim() || "구간",
          speakers: Array.isArray(t?.speakers)
            ? t.speakers.map(String).map(normalizeSpeakerName).filter(Boolean)
            : [],
          summary: (t?.summary || "").trim(),
          kind: typeof (t as { kind?: unknown })?.kind === "string"
            ? String((t as { kind?: string }).kind)
            : undefined,
        }))
      : [],
    decisions: Array.isArray(parsed.decisions)
      ? parsed.decisions.map(String).filter(Boolean)
      : [],
    actions: Array.isArray(parsed.actions)
      ? parsed.actions.map((a) => ({
          owner: normalizeSpeakerName(a?.owner || ""),
          task: (a?.task || "").trim(),
          due: (a?.due || "").trim(),
        }))
      : [],
    speakers,
    dialogue,
  };

  const parsedKeywords = Array.isArray(
    (parsed as { keywords?: unknown }).keywords,
  )
    ? ((parsed as { keywords: unknown[] }).keywords as unknown[])
        .map(String)
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  structure.keywords = keywordsFromSemantic({
    ...structure,
    keywords: parsedKeywords,
  });

  return { structure, usage };
}

/** 목록용 핵심 주제 키워드. 모델 출력 우선, 없으면 구간·결정·화자 태그에서 보조. */
export function keywordsFromSemantic(
  sem: Pick<
    SemanticStructure,
    "keywords" | "timeline" | "decisions" | "speakers" | "actions"
  >,
  limit = 5,
): string[] {
  const processLike =
    /^(?:STT|업로드|요약|타임라인|처리중|처리\s*중|AI|diarize|화자분리|녹음|변환|완료|예정)$/i;
  const seen = new Set<string>();
  const out: string[] = [];

  function push(raw: string) {
    const t = raw.trim().replace(/^#/, "");
    if (!t || t.length > 12 || processLike.test(t) || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  }

  for (const k of sem.keywords ?? []) push(k);
  if (out.length >= limit) return out.slice(0, limit);

  for (const s of sem.speakers ?? []) {
    for (const tag of s.tags ?? []) push(tag);
  }
  for (const d of sem.decisions ?? []) {
    const short = d.split(/[.,，。]/)[0]?.trim() ?? d;
    if (short.length <= 12) push(short);
  }
  for (const a of sem.actions ?? []) {
    const short = a.task.split(/[.,，。]/)[0]?.trim() ?? a.task;
    if (short.length <= 12) push(short);
  }
  for (const t of sem.timeline ?? []) {
    if (t.title.length <= 12) push(t.title);
  }

  return out.slice(0, limit);
}

/** 상세 상단 요약 문자열(내보내기용). UI는 구역 분리 컴포넌트를 쓴다. */
export function composeDisplaySummary(sem: SemanticStructure): string {
  return sem.overallSummary.trim();
}
