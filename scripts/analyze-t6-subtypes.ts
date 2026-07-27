/**
 * T6 하위 유형 분류 + 모델 잘못 CER + 구간 경계 누락 규모.
 * 캐시 전사만 사용. API 호출 없음.
 *
 * npx tsx --tsconfig tsconfig.json scripts/analyze-t6-subtypes.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { alignedCer, normalize } from "./lib/cer";
import {
  MODEL_FAULT_NORM_LIST,
  modelFaultCer,
  normalizeForModelFault,
} from "./lib/model-fault-cer";

const DIR = ".data/stt-bench/fixtures";
const OUT_DIR = "Faith-office/stt-term-runs";
const E1 = join(OUT_DIR, "_e1_classified_v2.json");
const ROLE_TAG = /^\[[^\]]{1,6}\]\s*/;
const INAUDIBLE = /\*{2,}/;
const ALIASES = [
  "brief-envwork",
  "brief-rda",
  "brief-mnd",
  "brief-mofa",
] as const;

type SubtypeId =
  | "omit_short"
  | "omit_phrase"
  | "omit_overlap"
  | "phonetic"
  | "nonphonetic"
  | "paraphrase"
  | "insert"
  | "self_repair"
  | "chunk_boundary"
  | "align_noise";

type T6Case = {
  index: number;
  fixture: string;
  paraIndex: number;
  dist: number;
  ref: string;
  hyp: string;
  refCtx: string;
  hypCtx: string;
  subtype: SubtypeId;
  fix: string[];
  note: string;
};

/** E1 T6 84건 전수 수동 하위 유형. 인덱스는 E1 tagged 필터 순서. */
const SUBTYPES: Array<{
  subtype: SubtypeId;
  fix: string[];
  note: string;
}> = [
  // 00-27 envwork
  { subtype: "nonphonetic", fix: ["base_model"], note: "보고→그, 문맥 대치" },
  { subtype: "phonetic", fix: ["base_model"], note: "기후부→기획부" },
  { subtype: "omit_short", fix: ["base_model"], note: "대통령님→대통령" },
  {
    subtype: "nonphonetic",
    fix: ["base_model", "context"],
    note: "비교적→되게",
  },
  { subtype: "paraphrase", fix: ["none"], note: "이렇게→그렇게 지시어" },
  { subtype: "insert", fix: ["base_model"], note: "없고 삽입" },
  { subtype: "nonphonetic", fix: ["base_model"], note: "니까그러→을" },
  {
    subtype: "align_noise",
    fix: ["none"],
    note: "기자 인사와 장관님 정렬 붕괴",
  },
  { subtype: "phonetic", fix: ["base_model"], note: "집어가→씹어먹" },
  { subtype: "nonphonetic", fix: ["base_model"], note: "나는→에서난" },
  { subtype: "insert", fix: ["base_model"], note: "는지 삽입" },
  { subtype: "omit_phrase", fix: ["base_model", "context"], note: "그러니까거" },
  { subtype: "nonphonetic", fix: ["base_model"], note: "아니에요 정렬 조각" },
  {
    subtype: "nonphonetic",
    fix: ["base_model", "context"],
    note: "지난한→진화된",
  },
  { subtype: "omit_phrase", fix: ["base_model"], note: "는이걸 누락" },
  { subtype: "paraphrase", fix: ["none"], note: "하셔야→해서해 어미" },
  { subtype: "nonphonetic", fix: ["base_model", "context"], note: "묘수→아니" },
  { subtype: "insert", fix: ["base_model"], note: "요→그 경계 조각" },
  {
    subtype: "insert",
    fix: ["context"],
    note: "산업→산업부, 문맥이면 맞을 수도",
  },
  { subtype: "paraphrase", fix: ["none"], note: "했던→됐던 태" },
  {
    subtype: "paraphrase",
    fix: ["none"],
    note: "한→하는, 경계 근처이나 내용 유지",
  },
  {
    subtype: "self_repair",
    fix: ["none"],
    note: "합리할수합리적으로→합리적으로 말더듬 축약",
  },
  { subtype: "paraphrase", fix: ["none"], note: "장차→향후 동의어" },
  { subtype: "phonetic", fix: ["base_model"], note: "감수→감소" },
  { subtype: "phonetic", fix: ["base_model"], note: "못하겠→모르겠" },
  { subtype: "insert", fix: ["base_model"], note: "된다 삽입" },
  {
    subtype: "nonphonetic",
    fix: ["base_model"],
    note: "할수는없는→할수있는 부정 반전",
  },
  { subtype: "omit_short", fix: ["base_model"], note: "는또→도" },
  // 28-35 rda
  { subtype: "phonetic", fix: ["base_model"], note: "참외→참여" },
  { subtype: "phonetic", fix: ["base_model"], note: "안정→안전" },
  { subtype: "nonphonetic", fix: ["base_model", "context"], note: "현황→협력" },
  { subtype: "phonetic", fix: ["base_model"], note: "육성→육수" },
  { subtype: "phonetic", fix: ["base_model", "context"], note: "산업→사육" },
  { subtype: "phonetic", fix: ["base_model"], note: "각기→각각" },
  { subtype: "phonetic", fix: ["base_model"], note: "균주→준주" },
  { subtype: "phonetic", fix: ["base_model"], note: "씨돼지→시돼지" },
  // 36-44 mnd
  { subtype: "phonetic", fix: ["base_model"], note: "31일→30일" },
  {
    subtype: "paraphrase",
    fix: ["none"],
    note: "맞이하셔서→맞으셔가지고 구어",
  },
  {
    subtype: "omit_overlap",
    fix: ["base_model", "context"],
    note: "군사기저하의사기→군사기저하, 겹말 누락",
  },
  { subtype: "phonetic", fix: ["base_model"], note: "라는→하는" },
  { subtype: "phonetic", fix: ["base_model"], note: "군무→근무" },
  { subtype: "omit_short", fix: ["base_model"], note: "그런 누락" },
  { subtype: "insert", fix: ["base_model"], note: "시죠 삽입" },
  { subtype: "omit_short", fix: ["base_model"], note: "거 누락" },
  { subtype: "phonetic", fix: ["base_model"], note: "소회→후회" },
  // 45-83 mofa
  {
    subtype: "align_noise",
    fix: ["none"],
    note: "2월에 위치만 이동, 가설에 존재",
  },
  { subtype: "paraphrase", fix: ["none"], note: "과→이랑그 구어" },
  { subtype: "phonetic", fix: ["base_model"], note: "정책→정치" },
  { subtype: "paraphrase", fix: ["none"], note: "기관인→기관이" },
  { subtype: "omit_short", fix: ["base_model"], note: "사건→건" },
  { subtype: "insert", fix: ["preprocess_n1"], note: "이렇게→게이제 담화 혼입" },
  {
    subtype: "insert",
    fix: ["base_model", "context"],
    note: "우리가관계기관하고 삽입",
  },
  {
    subtype: "omit_phrase",
    fix: ["base_model"],
    note: "는이걸 누락 (삽입과 쌍)",
  },
  { subtype: "omit_short", fix: ["none"], note: "예 응답표지" },
  { subtype: "omit_short", fix: ["base_model"], note: "점을→을" },
  { subtype: "paraphrase", fix: ["none"], note: "좀→를 조사 자리" },
  { subtype: "paraphrase", fix: ["none"], note: "않았냐→않았나라는" },
  {
    subtype: "omit_short",
    fix: ["base_model", "chunk_end"],
    note: "계신지요 말끝 잘림",
  },
  { subtype: "phonetic", fix: ["base_model"], note: "정보화→정부와" },
  { subtype: "omit_phrase", fix: ["base_model"], note: "관련 누락" },
  { subtype: "insert", fix: ["base_model"], note: "그런 삽입" },
  { subtype: "insert", fix: ["base_model"], note: "가능→가능성" },
  { subtype: "phonetic", fix: ["base_model"], note: "통지→통제" },
  { subtype: "phonetic", fix: ["base_model"], note: "공관→공간" },
  { subtype: "insert", fix: ["base_model"], note: "약→약한" },
  { subtype: "paraphrase", fix: ["none"], note: "있었던→있는 시제" },
  { subtype: "phonetic", fix: ["base_model"], note: "공격과→공개가" },
  { subtype: "omit_phrase", fix: ["base_model"], note: "그걸 누락" },
  { subtype: "paraphrase", fix: ["none"], note: "했습니다만→마는" },
  { subtype: "paraphrase", fix: ["none"], note: "말씀주신→말씀드린" },
  { subtype: "omit_phrase", fix: ["base_model"], note: "어떤 누락" },
  { subtype: "phonetic", fix: ["base_model"], note: "해역→해협" },
  {
    subtype: "chunk_boundary",
    fix: ["chunk_overlap"],
    note: "청크 경계에서 미국→이제똑",
  },
  {
    subtype: "chunk_boundary",
    fix: ["chunk_overlap"],
    note: "경계 직후 그런 삽입",
  },
  { subtype: "insert", fix: ["preprocess_n1"], note: "이나→이제 담화 혼입" },
  { subtype: "phonetic", fix: ["base_model"], note: "사항→상황" },
  {
    subtype: "insert",
    fix: ["preprocess_n1"],
    note: "이제그런우리가우리도 담화 덩어리",
  },
  { subtype: "omit_phrase", fix: ["base_model"], note: "따로 누락" },
  { subtype: "insert", fix: ["base_model"], note: "해협 메아리 삽입" },
  { subtype: "phonetic", fix: ["base_model"], note: "공공재→공공제" },
  { subtype: "insert", fix: ["base_model"], note: "않겠 삽입" },
  { subtype: "phonetic", fix: ["base_model"], note: "공공재→공공제" },
  { subtype: "nonphonetic", fix: ["base_model"], note: "취해→지내" },
  { subtype: "insert", fix: ["base_model"], note: "요→그" },
];

const SUBTYPE_LABEL: Record<SubtypeId, string> = {
  omit_short: "짧은 누락 (1-2자)",
  omit_phrase: "구 단위 누락 (3자+)",
  omit_overlap: "겹말 구간 누락",
  phonetic: "발음 유사 치환",
  nonphonetic: "발음 비유사 치환 (문맥 지어냄)",
  paraphrase: "뜻 비슷한 바꿔쓰기",
  insert: "내용 삽입",
  self_repair: "말더듬, 중복 축약",
  chunk_boundary: "구간 경계 손상",
  align_noise: "정렬 잡음",
};

const FILLERS_LENIENT = new Set(["이제", "인제", "어", "음", "아", "에"]);

function dropFillersLenient(text: string): string {
  return text
    .split(/\s+/)
    .filter((w) => !FILLERS_LENIENT.has(w.replace(/[,.]/g, "")))
    .join(" ");
}

function refParagraphsRaw(alias: string): string[] {
  const raw = readFileSync(join(DIR, `${alias}.reference.txt`), "utf8");
  return raw
    .split("\n")
    .map((line) => line.replace(ROLE_TAG, ""))
    .filter((line) => !INAUDIBLE.test(line))
    .filter((line) => normalize(line).length >= 25);
}

function hypText(alias: string): string {
  const cache = join(DIR, `${alias}.hypothesis.txt`);
  if (!existsSync(cache)) {
    throw new Error(`캐시 전사 없음: ${cache}`);
  }
  return readFileSync(cache, "utf8");
}

function chunkJoins(alias: string) {
  const hyp = hypText(alias);
  const parts = hyp.split("\n");
  const joins: Array<{
    index: number;
    leftTail: string;
    rightHead: string;
    midSentence: boolean;
  }> = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const left = parts[i]!.trimEnd();
    const right = parts[i + 1]!.trimStart();
    const midSentence = !/[.?!。]$/.test(left) && right.length > 0;
    joins.push({
      index: i,
      leftTail: left.slice(-80),
      rightHead: right.slice(0, 80),
      midSentence,
    });
  }
  return { partCount: parts.length, joins };
}

function maskCheckSamples(): Array<{
  label: string;
  before: string;
  after: string;
  stillDiffers: boolean;
}> {
  // 진짜 모델 오류 표본이 정규화에 살아남는지
  const samples: Array<[string, string, string]> = [
    ["T6 비교적→되게", "비교적 꼼꼼하게", "되게 꼼꼼하게"],
    ["T6 지난한→진화된", "지난한 역사", "진화된 역사"],
    ["T6 의사기 누락", "군사기 저하 의사기를", "군사기 저하를"],
    ["T1 씨마늘→시방을", "씨마늘", "시방을"],
    ["T4 킥오프→키크오프", "킥오프", "키크오프"],
    ["N1 이제 (지워져야)", "이제 외교부는", "외교부는"],
    ["N2 일곱→7", "일곱 곳", "7곳"],
    ["N3 데에→데", "데에 대한", "데 대한"],
    ["위험: 의→에 미적용", "국가의 이익", "국가에 이익"],
  ];
  return samples.map(([label, a, b]) => {
    const na = normalizeForModelFault(a);
    const nb = normalizeForModelFault(b);
    return {
      label,
      before: `${a} vs ${b}`,
      after: `${na} vs ${nb}`,
      stillDiffers: na !== nb,
    };
  });
}

function main(): void {
  if (!existsSync(E1)) throw new Error(`E1 없음: ${E1}`);
  const e1 = JSON.parse(readFileSync(E1, "utf8")) as {
    tagged: Array<{
      fixture: string;
      paraIndex: number;
      type: string;
      dist: number;
      ref: string;
      hyp: string;
      refCtx: string;
      hypCtx: string;
    }>;
  };

  const t6raw = e1.tagged.filter((t) => t.type === "T6_general");
  if (t6raw.length !== SUBTYPES.length) {
    throw new Error(
      `T6 ${t6raw.length}건인데 하위유형 표 ${SUBTYPES.length}건`,
    );
  }

  const cases: T6Case[] = t6raw.map((t, i) => ({
    index: i,
    fixture: t.fixture,
    paraIndex: t.paraIndex,
    dist: t.dist,
    ref: t.ref || "",
    hyp: t.hyp || "",
    refCtx: t.refCtx || "",
    hypCtx: t.hypCtx || "",
    ...SUBTYPES[i]!,
  }));

  const totalErrorChars = 640;
  const bySubtype = new Map<
    SubtypeId,
    { count: number; chars: number; samples: T6Case[] }
  >();
  for (const c of cases) {
    const cur = bySubtype.get(c.subtype) ?? {
      count: 0,
      chars: 0,
      samples: [],
    };
    cur.count += 1;
    cur.chars += c.dist;
    cur.samples.push(c);
    bySubtype.set(c.subtype, cur);
  }

  const subtypeTable = [...bySubtype.entries()]
    .map(([id, v]) => ({
      id,
      label: SUBTYPE_LABEL[id],
      count: v.count,
      chars: v.chars,
      shareOfAllError: Number((v.chars / totalErrorChars).toFixed(4)),
      shareOfT6: Number((v.chars / 179).toFixed(4)),
      sharePctOfAllError: Number(((v.chars / totalErrorChars) * 100).toFixed(1)),
      samples: v.samples.slice(0, 3).map((s) => ({
        from: s.ref || "(없음)",
        to: s.hyp || "(누락)",
        fixture: s.fixture,
        note: s.note,
      })),
      fixVotes: (() => {
        const m = new Map<string, number>();
        for (const s of v.samples) {
          for (const f of s.fix) m.set(f, (m.get(f) ?? 0) + s.dist);
        }
        return [...m.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([k, chars]) => ({ means: k, chars }));
      })(),
    }))
    .sort((a, b) => b.chars - a.chars);

  const fixJudgement: Record<
    SubtypeId,
    {
      baseModel: string;
      audioPreprocess: string;
      contextInject: string;
      chunkSplit: string;
      impossible: string;
      evidence: string;
    }
  > = {
    omit_short: {
      baseModel: "일부",
      audioPreprocess: "거의 없음",
      contextInject: "거의 없음",
      chunkSplit: "아님",
      impossible: "짧은 조사/말끝은 남을 수 있음",
      evidence: "님,거,그런,사(사건) 등 짧고 정보가 적은 조각",
    },
    omit_phrase: {
      baseModel: "예",
      audioPreprocess: "거의 없음",
      contextInject: "일부 (앞뒤 문맥)",
      chunkSplit: "아님 (경계 몰림 없음)",
      impossible: "아니오",
      evidence: "는이걸,그러니까거,관련,그걸,어떤,따로 — 문장 중간 구 누락",
    },
    omit_overlap: {
      baseModel: "예",
      audioPreprocess: "아니오",
      contextInject: "예 (군사기/사기 구분)",
      chunkSplit: "아니오 (mnd 단일 청크)",
      impossible: "아니오",
      evidence: "군사기저하의사기를→군사기저하를, 단일 청크에서 겹말 붕괴",
    },
    phonetic: {
      baseModel: "예 (상위/한국어 튜닝)",
      audioPreprocess: "일부 (잡음 심할 때만)",
      contextInject: "일부 (참외/현황 등 주제)",
      chunkSplit: "아니오",
      impossible: "아니오",
      evidence: "참외→참여,감수→감소,정책→정치,공관→공간 등 음소 근접",
    },
    nonphonetic: {
      baseModel: "예 (LM 교정력)",
      audioPreprocess: "아니오",
      contextInject: "예",
      chunkSplit: "아니오",
      impossible: "아니오",
      evidence: "비교적→되게,지난한→진화된,묘수→아니 — 발음 무관",
    },
    paraphrase: {
      baseModel: "낮음",
      audioPreprocess: "아니오",
      contextInject: "아니오",
      chunkSplit: "아니오",
      impossible: "의미 동치면 지표에서 빼는 편이 맞음",
      evidence: "장차→향후,말씀주신→드린,했던→됐던",
    },
    insert: {
      baseModel: "일부",
      audioPreprocess: "아니오",
      contextInject: "일부",
      chunkSplit: "아니오",
      impossible: "담화 삽입은 N1 정규화로 일부 제거",
      evidence: "우리가관계기관하고,海峡 메아리,담화 덩어리",
    },
    self_repair: {
      baseModel: "아니오 (정답지가 말더듬을 남김)",
      audioPreprocess: "아니오",
      contextInject: "아니오",
      chunkSplit: "아니오",
      impossible: "편집 기준 차이 — 모델 잘못으로 보기 애매",
      evidence: "합리할수합리적으로→합리적으로",
    },
    chunk_boundary: {
      baseModel: "아니오 (경계 산출 문제)",
      audioPreprocess: "아니오",
      contextInject: "부분만 (현재 CONTEXT_CHARS=150으로 부족)",
      chunkSplit: "예 — 우리 코드 잘못",
      impossible: "아니오, 겹침/재연결로 회수",
      evidence:
        "mofa part1끝 '그래서 이제' + part2앞 '똑같은 경우' ← ref '그래서 미국 같은 경우'",
    },
    align_noise: {
      baseModel: "해당 없음",
      audioPreprocess: "해당 없음",
      contextInject: "해당 없음",
      chunkSplit: "해당 없음",
      impossible: "정렬/채점 잡음",
      evidence: "2월에는 가설에 이미 있음, 장관님↔입니다 정렬",
    },
  };

  // 구간 경계
  const boundaries = Object.fromEntries(
    ALIASES.map((a) => [a, chunkJoins(a)]),
  );
  const boundaryCases = cases.filter((c) => c.subtype === "chunk_boundary");
  const boundaryChars = boundaryCases.reduce((s, c) => s + c.dist, 0);
  const refTotal = 8799;

  // CER 표
  const cerRows = ALIASES.map((alias) => {
    const rawParas = refParagraphsRaw(alias);
    const hyp = hypText(alias);
    const strict = alignedCer(
      rawParas.map((p) => normalize(p)),
      normalize(hyp),
    );
    const lenient = alignedCer(
      rawParas.map((p) => normalize(dropFillersLenient(p))),
      normalize(dropFillersLenient(hyp)),
    );
    const modelFault = modelFaultCer(rawParas, hyp);
    return {
      fixture: alias,
      strictCer: Number(strict.cer.toFixed(4)),
      lenientCer: Number(lenient.cer.toFixed(4)),
      modelFaultCer: Number(modelFault.cer.toFixed(4)),
      strictRefChars: strict.refChars,
      modelFaultRefChars: modelFault.refChars,
      strictPct: Number((strict.cer * 100).toFixed(1)),
      lenientPct: Number((lenient.cer * 100).toFixed(1)),
      modelFaultPct: Number((modelFault.cer * 100).toFixed(1)),
    };
  });

  const w = (pick: (r: (typeof cerRows)[0]) => number) => {
    const tot = cerRows.reduce((s, r) => s + r.strictRefChars, 0);
    return cerRows.reduce((s, r) => s + pick(r) * r.strictRefChars, 0) / tot;
  };

  const e1Floor = {
    note: "E1 cerIfModelFaultFixed = 모델 잘못을 없앤 뒤 남는 CER (N1+N2+N3+U)",
    values: {
      "brief-envwork": 0.0266,
      "brief-rda": 0.0207,
      "brief-mnd": 0.0352,
      "brief-mofa": 0.0695,
      weighted: 0.0444,
    },
  };
  const e1ModelFaultRate = {
    note: "E1 modelFaultChars/refChars = 모델 잘못만의 CER",
    values: {
      "brief-envwork": Number((74 / 3346).toFixed(4)),
      "brief-rda": Number((72 / 1157).toFixed(4)),
      "brief-mnd": Number((17 / 596).toFixed(4)),
      "brief-mofa": Number((86 / 3700).toFixed(4)),
      weighted: Number((249 / 8799).toFixed(4)),
    },
  };

  const mask = maskCheckSamples();
  const maskedRealErrors = mask.filter(
    (m) => m.label.startsWith("T") && !m.stillDiffers,
  );

  const priority = [
    {
      action: "구간 겹침(overlap) 또는 경계 재전사",
      where:
        "src/lib/stt/chunked-transcribe.ts prepareChunks/join, CONTEXT_CHARS",
      recoverableChars: boundaryChars,
      recoverableCerPp: Number(((boundaryChars / refTotal) * 100).toFixed(3)),
      note: "확정 경계 손상은 mofa 1건 묶음(미국→이제똑 + 인접 삽입). 글자 수는 작지만 코드 버그",
    },
    {
      action: "기반 모델 교체 또는 한국어 튜닝 모델",
      where: "gpt-4o-mini-transcribe → 상위/한튜닝",
      recoverableChars: subtypeTable
        .filter((s) =>
          ["phonetic", "nonphonetic", "omit_phrase", "omit_overlap"].includes(
            s.id,
          ),
        )
        .reduce((n, s) => n + s.chars, 0),
      recoverableCerPp: null as number | null,
      note: "T6의 발음유사+비유사+구누락+겹말 = 모델 본체 몫",
    },
    {
      action: "문맥/주제 주입 (프롬프트 예산 안)",
      where: "chunked-transcribe firstPrompt/continuePrompt",
      recoverableChars: null,
      recoverableCerPp: null,
      note: "비교적→되게,지난한→진화된,현황→협력 등 문맥 지어냄에 유효",
    },
    {
      action: "용어집 (T1, 별도 작업)",
      where: "glossary/term-correction",
      recoverableChars: 64,
      recoverableCerPp: Number(((64 / refTotal) * 100).toFixed(2)),
      note: "E1 T1 64자, T6 밖",
    },
    {
      action: "평가 지표를 모델잘못 CER로 교체",
      where: "scripts/lib/model-fault-cer.ts",
      recoverableChars: 0,
      recoverableCerPp: 0,
      note: "개선이 숫자에 보이게. N1+N3 잔여가 아직 남음",
    },
  ];
  for (const p of priority) {
    if (p.recoverableChars != null && p.recoverableCerPp == null) {
      p.recoverableCerPp = Number(
        ((p.recoverableChars / refTotal) * 100).toFixed(2),
      );
    }
  }

  const report = {
    taskId: "T6",
    date: "2026-07-27",
    source: "_e1_classified_v2.json T6_general 84건/179자",
    apiCalls: 0,
    t6: {
      count: cases.length,
      chars: cases.reduce((s, c) => s + c.dist, 0),
      shareOfErrorChars: Number((179 / 640).toFixed(4)),
      subtypes: subtypeTable,
      cases,
    },
    fixJudgement,
    chunkBoundary: {
      present: boundaryCases.length > 0,
      confirmed: true,
      cases: boundaryCases.map((c) => ({
        fixture: c.fixture,
        from: c.ref || "(없음)",
        to: c.hyp || "(누락)",
        chars: c.dist,
        note: c.note,
      })),
      chars: boundaryChars,
      cerPercentagePoints: Number(((boundaryChars / refTotal) * 100).toFixed(3)),
      joins: boundaries,
      fixWhere: {
        file: "src/lib/stt/chunked-transcribe.ts",
        what: [
          "prepareChunks: 무음 탐색으로도 문장 중간 절단 (envwork join1, mofa join1)",
          "parts.join('\\n'): 경계 중복/유실 검사 없음",
          "continuePrompt CONTEXT_CHARS=150: 경계 직전 고유명사(미국) 복원에 부족",
          "고치려면 청크 끝 N초 겹침 전사 후 접미-접두 정렬로 합치거나, 경계 전후만 재전사",
        ],
      },
      note: "rda/mnd는 단일 청크. 의사기 누락은 경계 아님.",
    },
    modelFaultMetric: {
      module: "scripts/lib/model-fault-cer.ts",
      normalization: MODEL_FAULT_NORM_LIST,
      maskCheck: mask,
      realErrorsMaskedByNorm: maskedRealErrors,
      realErrorsMaskedCount: maskedRealErrors.length,
      cerTable: cerRows,
      weighted: {
        strict: Number((w((r) => r.strictCer) * 100).toFixed(2)),
        lenient: Number((w((r) => r.lenientCer) * 100).toFixed(2)),
        modelFault: Number((w((r) => r.modelFaultCer) * 100).toFixed(2)),
      },
      vsE1: {
        e1FloorResidualCer: e1Floor,
        e1ModelFaultOnlyCer: e1ModelFaultRate,
        interpretation:
          "이번 지표는 모델 잘못 CER에 가깝게 내려가야 한다. E1의 2.7/2.1/3.5/7.0/4.4%는 반대로 '모델 잘못을 고친 뒤 남는 바닥'이다. 비교 대상은 e1ModelFaultOnlyCer(가중 2.83%)이다.",
      },
    },
    priority,
    findings: [
      "T6 최대 덩어리는 발음 유사 치환 + 발음 비유사(문맥 지어냄) + 구 누락",
      "구간 경계 손상 확정: mofa '미국→이제똑' (소량이지만 코드 버그)",
      "의사기 누락은 경계가 아니라 겹말 LM 붕괴 (mnd 단일 청크)",
      "모델잘못 CER은 strict보다 낮고, E1 모델잘못 비율(2.8%)에 접근. N3 잔여로 완전 일치는 아님",
    ],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outJson = join(OUT_DIR, "2026-07-27_T6_subtype-and-metric.json");
  writeFileSync(outJson, JSON.stringify(report, null, 2), "utf8");

  // 요약 md
  const lines: string[] = [];
  lines.push("# T6 일반 오인식 하위 유형 + 모델 잘못 지표");
  lines.push("");
  lines.push("## 1. T6 하위 유형");
  lines.push("");
  lines.push("| 유형 | 건수 | 글자 | 전체오류% | 사례 |");
  lines.push("|---|---:|---:|---:|---|");
  for (const s of subtypeTable) {
    const ex = s.samples
      .map((x) => `${x.from}→${x.to}`)
      .join(", ");
    lines.push(
      `| ${s.label} | ${s.count} | ${s.chars} | ${s.sharePctOfAllError} | ${ex} |`,
    );
  }
  lines.push("");
  lines.push("## 2. CER 비교");
  lines.push("");
  lines.push("| 픽스처 | strict | lenient | 모델잘못 |");
  lines.push("|---|---:|---:|---:|");
  for (const r of cerRows) {
    lines.push(
      `| ${r.fixture} | ${r.strictPct}% | ${r.lenientPct}% | ${r.modelFaultPct}% |`,
    );
  }
  lines.push(
    `| 가중 | ${report.modelFaultMetric.weighted.strict}% | ${report.modelFaultMetric.weighted.lenient}% | ${report.modelFaultMetric.weighted.modelFault}% |`,
  );
  lines.push("");
  lines.push(`경계 누락 확정 글자: ${boundaryChars}자 (${report.chunkBoundary.cerPercentagePoints}%p)`);
  lines.push("");
  lines.push(`산출: ${outJson}`);

  const outMd = join(OUT_DIR, "2026-07-27_T6_summary.md");
  writeFileSync(outMd, lines.join("\n"), "utf8");

  console.log(lines.join("\n"));
  console.log("\nmask check:");
  for (const m of mask) {
    console.log(
      `  ${m.stillDiffers ? "KEEP" : "MASK"} ${m.label}: ${m.after}`,
    );
  }
}

main();
