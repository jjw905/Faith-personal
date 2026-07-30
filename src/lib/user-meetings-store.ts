import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";
import type { SemanticStructure } from "@/lib/stt/semantic-structure";
import type { SttModel } from "@/lib/stt/models";
import type { WorkspaceId } from "@/lib/workspaces";

export type MeetingProcessPhase =
  | "transcribing"
  | "structuring"
  | "done"
  | "error"
  /** 기술적 오류가 아니라 감지된 내용이 없어 저장하지 않은 경우. */
  | "empty";

export type UserMeetingRecord = {
  id: string;
  userId: string;
  vaultFileId?: string;
  model: SttModel;
  phase: MeetingProcessPhase;
  /** 0–100. 파이프라인 실제 단계·청크 진행과 동기. */
  progressPercent?: number;
  /** "받아쓰는 중", "분석하는 중" 등 진행 중 세부 단계 문구. */
  stageLabel?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  workspace: WorkspaceId;
  meeting: Meeting;
  transcript: MeetingTranscript;
  timeline: MeetingTimeline;
  rawText?: string;
  semantic?: SemanticStructure;
};

const ROOT = join(process.cwd(), ".data", "user-meetings");

function ensureRoot() {
  mkdirSync(ROOT, { recursive: true });
}

/** 회의 id는 파일 경로가 되므로 영문, 숫자, -, _ 만 허용한다. */
function safeMeetingId(id: string) {
  return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : null;
}

function pathFor(id: string) {
  const safe = safeMeetingId(id);
  if (!safe) throw new Error("잘못된 회의 id입니다.");
  return join(ROOT, `${safe}.json`);
}

export function saveUserMeeting(record: UserMeetingRecord) {
  ensureRoot();
  writeFileSync(pathFor(record.id), JSON.stringify(record, null, 2), "utf8");
}

export function getUserMeeting(id: string): UserMeetingRecord | null {
  if (!safeMeetingId(id)) return null;
  const p = pathFor(id);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as UserMeetingRecord;
  } catch {
    return null;
  }
}

export function listUserMeetings(userId?: string): UserMeetingRecord[] {
  ensureRoot();
  const files = readdirSync(ROOT).filter((f) => f.endsWith(".json"));
  const rows: UserMeetingRecord[] = [];
  for (const f of files) {
    try {
      const row = JSON.parse(
        readFileSync(join(ROOT, f), "utf8"),
      ) as UserMeetingRecord;
      if (userId && row.userId !== userId) continue;
      rows.push(row);
    } catch {
      // skip corrupt
    }
  }
  return rows.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function updateUserMeeting(
  id: string,
  patch: Partial<UserMeetingRecord>,
): UserMeetingRecord | null {
  const cur = getUserMeeting(id);
  if (!cur) return null;
  const next: UserMeetingRecord = {
    ...cur,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  saveUserMeeting(next);
  return next;
}

/** 진행률은 감소하지 않음. phase도 같이 갱신 가능. */
export function setMeetingProgress(
  id: string,
  percent: number,
  patch: Partial<
    Pick<
      UserMeetingRecord,
      "phase" | "errorMessage" | "rawText" | "stageLabel"
    >
  > = {},
): UserMeetingRecord | null {
  const cur = getUserMeeting(id);
  if (!cur) return null;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const prev = cur.progressPercent ?? 0;
  return updateUserMeeting(id, {
    ...patch,
    progressPercent: Math.max(prev, clamped),
  });
}

/**
 * after() 백그라운드 잡이 서버 재시작 등으로 죽으면 phase가
 * transcribing/structuring에 영원히 남고, 클라이언트가 1초마다 status를 친다.
 * 마지막 갱신이 오래되면 실패로 닫아 폴링을 끊는다.
 */
export const STALE_PROCESSING_MS = 12 * 60 * 1000;

export function healStaleProcessingMeeting(
  id: string,
  nowMs: number = Date.now(),
): UserMeetingRecord | null {
  const cur = getUserMeeting(id);
  if (!cur) return null;
  if (cur.phase !== "transcribing" && cur.phase !== "structuring") {
    return cur;
  }
  const updated = new Date(cur.updatedAt).getTime();
  if (!Number.isFinite(updated) || nowMs - updated < STALE_PROCESSING_MS) {
    return cur;
  }
  const message =
    "분석이 중간에 멈췄습니다. 서버가 재시작됐거나 처리 시간이 초과됐습니다. 다시 업로드해 주세요.";
  return updateUserMeeting(id, {
    phase: "error",
    errorMessage: message,
    stageLabel: undefined,
    meeting: {
      ...cur.meeting,
      status: "completed",
      tags: [],
      summaryTags: [],
    },
    timeline: {
      ...cur.timeline,
      overallSummary: message,
      segments: [],
    },
  });
}

function removeMeetingWorkDir(id: string) {
  const safe = safeMeetingId(id);
  if (!safe) return;
  const dir = join(process.cwd(), ".data", "stt-work", safe);
  if (!existsSync(dir)) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // 작업 폴더 잔존은 기록 삭제보다 덜 치명적이라 조용히 넘긴다.
  }
}

export function deleteUserMeeting(id: string): boolean {
  if (!safeMeetingId(id)) return false;
  const p = pathFor(id);
  if (!existsSync(p)) return false;
  try {
    unlinkSync(p);
    removeMeetingWorkDir(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * retentionDays 초과분 개인 회의 기록만 골라낸다(카운트, 미리보기 용도라 삭제하지 않음).
 * 팀 워크스페이스 기록은 팀 정책 영역이라 개인 보존 설정으로 지우지 않는다.
 * 진행 중(transcribing/structuring) 건은 보존기간이 지나도 처리가 끝날 때까지 남긴다.
 */
export function findExpiredUserMeetings(
  userId: string,
  retentionDays: number,
  now: Date = new Date(),
): UserMeetingRecord[] {
  const days = Math.max(1, Math.floor(retentionDays));
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return listUserMeetings(userId).filter((row) => {
    if (row.workspace !== "personal") return false;
    if (row.phase === "transcribing" || row.phase === "structuring") {
      return false;
    }
    const created = new Date(row.createdAt).getTime();
    return Number.isFinite(created) && created < cutoff;
  });
}

/** 한 요청에서 지울 수 있는 최대 건수. 목록 조회 지연을 막는다. */
export const PURGE_USER_MEETINGS_MAX_PER_RUN = 50;

/**
 * 보존 기간이 지난 개인 회의 기록(전사·요약·타임라인)을 삭제한다.
 * 보관함 원본 파일(vaultFileId)은 별개 생명주기라 건드리지 않는다 — 사용자가
 * 보관함에서 직접 관리한다. 삭제는 비가역이라 호출 시점(설정 변경, 목록
 * 조회 시 지연 실행)에만 실행하고 별도 백그라운드 크론은 두지 않는다.
 * stt-work 작업 폴더도 함께 정리한다.
 */
export function purgeExpiredUserMeetings(
  userId: string,
  retentionDays: number,
  now: Date = new Date(),
  options?: { max?: number },
): { deleted: number; remaining: number } {
  const max = Math.max(1, options?.max ?? PURGE_USER_MEETINGS_MAX_PER_RUN);
  const expired = findExpiredUserMeetings(userId, retentionDays, now);
  const batch = expired.slice(0, max);
  let deleted = 0;
  for (const row of batch) {
    if (deleteUserMeeting(row.id)) deleted += 1;
  }
  return { deleted, remaining: Math.max(0, expired.length - batch.length) };
}

export function workDirForMeeting(meetingId: string) {
  const safe = safeMeetingId(meetingId);
  if (!safe) throw new Error("잘못된 회의 id입니다.");
  const dir = join(process.cwd(), ".data", "stt-work", safe);
  mkdirSync(dir, { recursive: true });
  return dir;
}
