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
- dialogue: 문장·안건 전환 기준으로 순서대로 나눈다. text는 원문 유지, 요약·의역·생략 금지.
- dialogue.startSec는 0부터 durationSec까지 흐름에 맞게 증가(초). 대략값이어도 된다. 서버가 STT 실측 시각으로 보정한다.
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

export async function buildSemanticStructure(
  sttText: string,
  durationSec: number,
): Promise<SemanticStructureResult> {
  const client = getOpenAIClient();
  const dur = Math.max(1, Math.round(durationSec));
  const res = await client.chat.completions.create({
    model: STRUCTURE_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: STRUCTURE_SYSTEM },
      {
        role: "user",
        content:
          `녹음 길이: ${dur}초\n` +
          `다음 STT로 회의록 상품 JSON을 완성하라.\n\n${sttText}`,
      },
    ],
  });

  const inputTokens = res.usage?.prompt_tokens ?? 0;
  const outputTokens = res.usage?.completion_tokens ?? 0;
  const totalTokens = res.usage?.total_tokens ?? inputTokens + outputTokens;
  const usage: StructureUsage = {
    model: STRUCTURE_MODEL,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedUsd: estimateStructureUsd(inputTokens, outputTokens),
  };

  const raw = res.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as Partial<SemanticStructure> & {
    dialogue?: Array<{ startSec?: number; text?: string; speaker?: string }>;
    speakers?: Array<{ name?: string; summary?: string; tags?: string[] }>;
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
