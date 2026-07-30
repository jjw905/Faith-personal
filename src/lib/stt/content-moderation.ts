import { getOpenAIClient } from "@/lib/stt/openai";
import { prisma } from "@/lib/prisma";

/**
 * 업로드 콘텐츠 자동 검열.
 *
 * 원칙: 운영진은 회의 본문에 접근하지 않는다. 사람이 읽고 판단하는 대신,
 * 무료 OpenAI moderation API(자동 소프트웨어 호출, STT와 같은 파이프라인
 * 단계)로 텍스트만 확인하고, 명백한 위반은 회의 기록 생성 자체를 막는다
 * (Dropbox/Google의 CSAM 해시매칭과 같은 "업로드 차단" 방식 — 사람이
 * 내용을 보거나 검토 큐에 쌓이지 않는다).
 *
 * 정상적인 업무·시사·정책 회의는 강간·폭행·자살 같은 단어를 다뤄도
 * 흔하다(예: 국회 상임위가 폭행 사건을 논의). 낮은 점수로 일반 카테고리를
 * 차단하면 정상 회의록을 대량 오차단한다. 그래서 실제로 차단하는 카테고리는
 * 아동 성적 콘텐츠·불법행위 실행 안내처럼 오탐 여지가 거의 없는 것만
 * 높은 문턱으로 잡는다. 나머지는 신호로만 기록해 반복 패턴을 볼 때 쓴다.
 */

const BLOCK_THRESHOLDS: Record<string, number> = {
  "sexual/minors": 0.2,
  "illicit/violent": 0.7,
  illicit: 0.8,
};

/** 차단하지 않고 신호로만 남기는 카테고리(오탐이 잦은 일반 범주). */
const SIGNAL_THRESHOLD = 0.5;

export type ModerationCheck = {
  blocked: boolean;
  /** 문턱을 넘은 카테고리(차단 여부와 무관하게 신호용으로도 기록). */
  categories: string[];
  maxScore: number;
};

/** 한 번에 넘길 글자 수. 모델 컨텍스트 한도가 문서화돼 있지 않아 안전하게 나눠 보낸다. */
const CHUNK_CHARS = 4000;

function splitForModeration(text: string): string[] {
  if (text.length <= CHUNK_CHARS) return [text];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_CHARS) {
    out.push(text.slice(i, i + CHUNK_CHARS));
  }
  return out;
}

/** 전체 녹음 어디에서 위반이 나와도 잡도록 텍스트 전체를 나눠서 확인한다(모더레이션은 무료). */
export async function checkTranscriptModeration(
  text: string,
): Promise<ModerationCheck> {
  if (!text.trim()) return { blocked: false, categories: [], maxScore: 0 };

  const client = getOpenAIClient();
  const chunks = splitForModeration(text);

  let blocked = false;
  let maxScore = 0;
  const categories = new Set<string>();

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;
    const res = await client.moderations.create({
      model: "omni-moderation-latest",
      input: chunk,
    });
    const result = res.results[0];
    if (!result) continue;

    const scores = result.category_scores as unknown as Record<string, number>;
    for (const [category, score] of Object.entries(scores)) {
      if (typeof score !== "number") continue;
      if (score > maxScore) maxScore = score;
      const blockThreshold = BLOCK_THRESHOLDS[category];
      if (blockThreshold !== undefined && score >= blockThreshold) {
        blocked = true;
        categories.add(category);
      } else if (score >= SIGNAL_THRESHOLD) {
        categories.add(category);
      }
    }
    // 이미 차단 사유를 찾았으면 나머지 구간은 더 볼 필요 없다.
    if (blocked) break;
  }

  return { blocked, categories: [...categories], maxScore };
}

/**
 * 판정 결과를 기록한다. 본문은 저장하지 않고 카테고리·점수만 남긴다.
 * 실패해도 업로드 흐름을 막지 않는다(로그 실패로 사용자 작업을 막을 이유가 없다).
 */
export async function logModerationFlag(params: {
  userId: string;
  meetingId?: string;
  check: ModerationCheck;
}) {
  if (params.check.categories.length === 0) return;
  try {
    await prisma.moderationFlag.create({
      data: {
        userId: params.userId,
        meetingId: params.meetingId,
        categories: params.check.categories,
        maxScore: params.check.maxScore,
        blocked: params.check.blocked,
      },
    });
  } catch (err) {
    console.warn("[moderation] 판정 기록 실패", err);
  }
}
