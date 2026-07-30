import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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

export function deleteUserMeeting(id: string): boolean {
  if (!safeMeetingId(id)) return false;
  const p = pathFor(id);
  if (!existsSync(p)) return false;
  try {
    unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

export function workDirForMeeting(meetingId: string) {
  const safe = safeMeetingId(meetingId);
  if (!safe) throw new Error("잘못된 회의 id입니다.");
  const dir = join(process.cwd(), ".data", "stt-work", safe);
  mkdirSync(dir, { recursive: true });
  return dir;
}
