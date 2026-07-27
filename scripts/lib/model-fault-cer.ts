/**
 * 모델 잘못만 보는 CER.
 *
 * scripts/lib/cer.ts 의 alignedCer 는 그대로 두고, 정답/가설에 같은 정규화를
 * 먼저 걸어 N1·N2·N3 성격의 차이를 지운 뒤 잰다.
 *
 * 정규화는 E1에서 실제로 관측된 것만 좁게 쓴다. 숫자를 깎으려고 규칙을
 * 늘리지 않는다.
 */
import { alignedCer, normalize, type AlignedCer } from "./cer";

/**
 * N1: E1에서 관측된 말버릇, 편집 담화표지.
 * 공백으로 나뉜 토큰과 일치할 때만 지운다.
 * 되게/매우 는 본문 부사로도 쓰이므로 제외 (비교적→되게 가림 방지).
 */
export const MODEL_FAULT_FILLERS: readonly string[] = [
  "이제",
  "인제",
  "그러니까",
  "그리고",
  "그런데",
  "이렇게",
  "그렇게",
  "근데",
  "먼저",
  "따로",
  "뭐",
  "좀",
  "또",
  "어",
  "음",
  "아",
  "네",
  "그",
];

/**
 * 붙여 쓴 담화 덩어리만 문자열에서 제거 (길이 3+).
 * 짧은 글자 부분문자열 삭제는 본문을 부러뜨리므로 금지.
 */
const ATTACHED_FILLER_CHUNKS: readonly string[] = [
  "그렇게이제",
  "이제이렇게",
  "요2월에이제",
  "이제을고그리이제",
  "을고그리",
  "고그리",
  "그렇게이",
  "그렇게을",
  "이렇게를",
  "그이제",
  "이제이",
  "나이제",
];

/**
 * N2: 숫자↔한글 수사. 정규화 전에 양쪽에 같은 형태로 모은다.
 * 정답지를 보고 맞추지 않고, 한국어 일반 수사만 둔다.
 */
const NATIVE_NUM: Array<[RegExp, string]> = [
  [/열한/g, "11"],
  [/열두/g, "12"],
  [/열세/g, "13"],
  [/열네/g, "14"],
  [/열다섯/g, "15"],
  [/열여섯/g, "16"],
  [/열일곱/g, "17"],
  [/열여덟/g, "18"],
  [/열아홉/g, "19"],
  [/스무/g, "20"],
  [/일곱/g, "7"],
  [/여덟/g, "8"],
  [/아홉/g, "9"],
  [/여섯/g, "6"],
  [/다섯/g, "5"],
  [/하나/g, "1"],
  [/열/g, "10"],
];

/** N2: 로마자↔한글 약어. */
const ORTHO_FOLD: Array<[RegExp, string]> = [[/\bun\b/gi, "유엔"]];

/**
 * N3: E1 관측분만. 데에→데.
 * 의↔에 는 단독 치환이 진짜 오류를 가려 전역 치환하지 않는다.
 */
const PARTICLE_FOLD: Array<[RegExp, string]> = [[/데에/g, "데"]];

export type ModelFaultNormReport = {
  fillers: readonly string[];
  attachedFillerChunks: readonly string[];
  orthography: string[];
  particles: string[];
  skipped: string[];
};

export const MODEL_FAULT_NORM_LIST: ModelFaultNormReport = {
  fillers: MODEL_FAULT_FILLERS,
  attachedFillerChunks: ATTACHED_FILLER_CHUNKS,
  orthography: [
    "한글 수사→아라비아 숫자 (하나,다섯..열, 열한..열아홉, 스무, 일곱 등)",
    "un/UN → 유엔",
    "거↔것, 그런→근 축약은 전역 치환 위험으로 제외",
  ],
  particles: ["데에 → 데"],
  skipped: [
    "의↔에 전역 치환 (실오류 가림)",
    "조사 삽입(을/를/니다) 일괄 삭제 (실오류 가림)",
    "되게/매우 (본문 부사 가능, T6 비교적→되게 가림)",
  ],
};

const FILLER_SET = new Set(MODEL_FAULT_FILLERS);

/** 공백 구분 토큰만 제거. 짧은 글자로 본문 부분문자열을 자르지 않는다. */
export function stripFillersRaw(text: string): string {
  let out = text
    .split(/\s+/)
    .filter((w) => {
      const core = w.replace(/^[.,?!“”"']+|[.,?!“”"']+$/g, "");
      return core.length > 0 && !FILLER_SET.has(core);
    })
    .join(" ");

  // 붙여 쓴 담화 덩어리 (길이 3+)
  for (const chunk of [...ATTACHED_FILLER_CHUNKS].sort(
    (a, b) => b.length - a.length,
  )) {
    if (out.includes(chunk)) out = out.split(chunk).join("");
  }
  return out.replace(/\s+/g, " ").trim();
}

export function foldOrthography(text: string): string {
  let out = text;
  for (const [re, to] of ORTHO_FOLD) out = out.replace(re, to);
  for (const [re, to] of NATIVE_NUM) out = out.replace(re, to);
  return out;
}

export function foldParticles(text: string): string {
  let out = text;
  for (const [re, to] of PARTICLE_FOLD) out = out.replace(re, to);
  return out;
}

/**
 * 모델 잘못 CER용 정규화.
 * 순서를 바꾸면 수사·담화표지가 서로 먹히므로 고정한다.
 */
export function normalizeForModelFault(text: string): string {
  const stepped = foldParticles(foldOrthography(stripFillersRaw(text)));
  return normalize(stepped);
}

export function modelFaultCer(
  refParasRaw: string[],
  hypRaw: string,
): AlignedCer {
  const refs = refParasRaw
    .map((p) => normalizeForModelFault(p))
    .filter((p) => p.length >= 25);
  return alignedCer(refs, normalizeForModelFault(hypRaw));
}
