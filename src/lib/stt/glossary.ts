/**
 * 전사에 미리 알려 줄 고유명사를 모은다.
 *
 * STT가 틀리는 자리는 대부분 고유명사다. 팔공산을 803으로, 김한승을 구만순으로
 * 받는다. 소리만 듣고는 가릴 수 없어서, 나올 법한 말을 미리 알려 줘야 한다.
 *
 * 사전을 통째로 넣는 게 아니다. 프롬프트에 쓸 수 있는 자리가 224토큰뿐이고,
 * 많이 넣으면 하지도 않은 말을 끼워 넣는다. 이 회의에 실제로 나올 말만 고른다.
 */

import { listUserMeetings } from "@/lib/user-meetings-store";

/** 프롬프트에 넣을 용어 수 상한. 늘리면 없는 말을 지어낸다. */
const MAX_TERMS = 24;
/** 용어 목록이 차지할 글자 수 상한. */
const MAX_CHARS = 140;

const MIN_LEN = 2;
const MAX_LEN = 12;

/** 고유명사로 볼 수 없는 흔한 말. 넣어 봐야 자리만 먹는다. */
const STOP = new Set([
  "회의",
  "녹음",
  "회의록",
  "제안",
  "논의",
  "검토",
  "보고",
  "예산",
  "안건",
  "위원",
  "위원회",
  "위원장",
  "의원",
  "장관",
  "차관",
  "정부",
  "국회",
  "오늘",
  "내일",
  "어제",
  "이번",
  "다음",
  "테스트",
  "기타",
  "정기",
  "임시",
  "주간",
  "월간",
]);

function clean(value: string): string {
  return value
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^0-9A-Za-z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 아직 실명을 못 찾은 자리표. 이걸 알려 주면 전사가 라벨을 받아 적는다. */
const PLACEHOLDER = /^화자\s*[A-Z가-힣]?$|^참석자\s*\d*$|^발화(자)?$/;

function usable(term: string): boolean {
  if (term.length < MIN_LEN || term.length > MAX_LEN) return false;
  if (STOP.has(term)) return false;
  if (PLACEHOLDER.test(term)) return false;
  // 숫자만 있는 것은 용어가 아니다
  if (!/[A-Za-z가-힣]/.test(term)) return false;
  return true;
}

/** 제목에서 고유명사가 될 만한 낱말만 뽑는다. */
function fromTitle(title: string): string[] {
  return clean(title)
    .split(" ")
    .map((w) => w.trim())
    .filter(usable);
}

/**
 * 이 사용자의 지난 회의에서 쌓인 말.
 *
 * 참석자 이름만 쓴다. 화면에 표시된 보정 추천은 사용자가 확인한 값이 아니므로
 * 다음 회의 용어로 다시 넣지 않는다.
 */
async function fromPastMeetings(
  userId: string,
  limit: number,
): Promise<string[]> {
  const rows = (await listUserMeetings(userId))
    .slice()
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, limit);

  const out: string[] = [];
  for (const row of rows) {
    for (const p of row.meeting?.participants ?? []) {
      // 업로드 분석이 음성에서 추정한 이름은 오인식일 수 있다. 이를 다음
      // 회의 사전에 넣으면 잘못된 이름이 추천과 STT 프롬프트로 자기증폭된다.
      // 계정/입장명 또는 사용자가 직접 고친 이름만 재사용한다.
      const userConfirmed = p.recognitionNote === "사용자가 확인한 이름";
      if (p.recognition === "voice" && !userConfirmed) continue;
      const name = clean(p.name ?? "");
      if (usable(name)) out.push(name);
    }
  }
  return out;
}

/**
 * 이번 회의 전사에 미리 알려 줄 용어.
 *
 * 앞에 올수록 중요한 순서로 담는다. 자리가 모자라면 뒤가 잘린다.
 */
export async function buildGlossary(params: {
  userId?: string;
  title?: string;
  participantNames?: string[];
  extra?: string[];
  pastMeetingLimit?: number;
}): Promise<string[]> {
  const ordered = [
    ...(params.extra ?? []).map(clean),
    ...(params.participantNames ?? []).map(clean),
    ...fromTitle(params.title ?? ""),
    ...(params.userId
      ? await fromPastMeetings(params.userId, params.pastMeetingLimit ?? 20)
      : []),
  ].filter(usable);

  const seen = new Set<string>();
  const terms: string[] = [];
  let chars = 0;
  for (const term of ordered) {
    if (seen.has(term)) continue;
    if (terms.length >= MAX_TERMS) break;
    if (chars + term.length + 2 > MAX_CHARS) continue;
    seen.add(term);
    terms.push(term);
    chars += term.length + 2;
  }
  return terms;
}
