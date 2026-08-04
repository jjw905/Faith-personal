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
import { Prisma } from "@prisma/client";

import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";
import type { SemanticStructure } from "@/lib/stt/semantic-structure";
import type { SttModel } from "@/lib/stt/models";
import type { WorkspaceId } from "@/lib/workspaces";
import type { AnalysisMode } from "@/lib/stt/analysis-mode";
import type { AnalysisDiagnostics } from "@/lib/stt/analysis-diagnostics";
import { normalizeSingleSpeakerMeetingPresentation } from "@/lib/stt/to-meeting";
import { faithDataPath } from "@/lib/faith-data-root";
import { prisma } from "@/lib/prisma";
import { deleteAiUsageForMeeting } from "@/lib/stt/usage-store";
import { deletePipelineAttemptsForMeeting } from "@/lib/stt/pipeline-stats-store";
import {
  isTeamEncryptedEnvelope,
  openTeamJson,
  sealTeamJson,
  teamEncryptionRequired,
} from "@/lib/team-encryption";

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
  /** 구 기록에는 없음. 없으면 일반 분석으로 본다. */
  analysisMode?: AnalysisMode;
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
  /** 새 분석부터 남는 단계별 품질 진단. 회의 본문은 중복 저장하지 않는다. */
  analysisDiagnostics?: AnalysisDiagnostics;
};

/** 저장 당시의 표시 버그를 읽는 시점에만 안전하게 보정한다. */
function normalizeSpeakerPresentation(
  record: UserMeetingRecord | null,
): UserMeetingRecord | null {
  if (!record) return record;
  const presentation = normalizeSingleSpeakerMeetingPresentation({
    semantic: record.semantic,
    meeting: record.meeting,
    transcript: record.transcript,
    timeline: record.timeline,
  });
  return { ...record, ...presentation };
}

const ROOT = faithDataPath("user-meetings");
const WORK_ROOT = faithDataPath("stt-work");
const USE_DATABASE = process.env.DURABLE_STATE_BACKEND === "database";

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

function dateOrNow(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function payloadRecord(value: unknown, fallback: {
  id: string;
  userId: string;
  workspace: string;
  phase: string;
  progressPercent: number | null;
}): UserMeetingRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as UserMeetingRecord;
  return {
    ...record,
    id: fallback.id,
    userId: fallback.userId,
    workspace: fallback.workspace as WorkspaceId,
    phase: fallback.phase as MeetingProcessPhase,
    ...(fallback.progressPercent === null
      ? {}
      : { progressPercent: fallback.progressPercent }),
  };
}

async function resolveTeamId(
  meetingId: string,
  explicitTeamId?: string,
) {
  if (explicitTeamId?.trim()) return explicitTeamId.trim();
  const teamMeeting = await prisma.teamMeeting.findFirst({
    where: { legacyMeetingId: meetingId },
    select: { teamId: true },
  });
  return teamMeeting?.teamId ?? null;
}

async function payloadForSave(
  record: UserMeetingRecord,
  explicitTeamId?: string,
) {
  if (record.workspace !== "team") return record as unknown as Prisma.JsonValue;
  const teamId = await resolveTeamId(record.id, explicitTeamId);
  if (!teamId) {
    if (teamEncryptionRequired()) {
      throw new Error("팀 회의와 팀 보안 키 연결을 확인할 수 없습니다.");
    }
    return record as unknown as Prisma.JsonValue;
  }
  return sealTeamJson(
    teamId,
    "content",
    record as unknown as Prisma.JsonValue,
  );
}

async function recordFromStoredPayload(params: {
  id: string;
  userId: string;
  workspace: string;
  phase: string;
  progressPercent: number | null;
  payload: Prisma.JsonValue;
}) {
  let payload: unknown = params.payload;
  if (params.workspace === "team") {
    const teamId = await resolveTeamId(params.id);
    if (teamId) {
      payload =
        (await openTeamJson<UserMeetingRecord>(
          teamId,
          "content",
          params.payload,
        )) ?? params.payload;
    } else if (isTeamEncryptedEnvelope(params.payload)) {
      throw new Error("암호화된 팀 회의의 팀 연결을 찾을 수 없습니다.");
    }
  }
  return payloadRecord(payload, {
    id: params.id,
    userId: params.userId,
    workspace: params.workspace,
    phase: params.phase,
    progressPercent: params.progressPercent,
  });
}

export async function saveUserMeeting(
  record: UserMeetingRecord,
  options?: { teamId?: string },
) {
  const payload = await payloadForSave(record, options?.teamId);
  if (USE_DATABASE) {
    await prisma.userMeetingRecord.upsert({
      where: { id: record.id },
      create: {
        id: record.id,
        userId: record.userId,
        workspace: record.workspace,
        phase: record.phase,
        progressPercent: record.progressPercent ?? null,
        payload: payload as Prisma.InputJsonValue,
        createdAt: dateOrNow(record.createdAt),
        updatedAt: dateOrNow(record.updatedAt),
      },
      update: {
        userId: record.userId,
        workspace: record.workspace,
        phase: record.phase,
        progressPercent: record.progressPercent ?? null,
        payload: payload as Prisma.InputJsonValue,
        updatedAt: dateOrNow(record.updatedAt),
      },
    });
    return;
  }
  ensureRoot();
  const stored =
    isTeamEncryptedEnvelope(payload) && record.workspace === "team"
      ? {
          id: record.id,
          userId: record.userId,
          workspace: record.workspace,
          phase: record.phase,
          progressPercent: record.progressPercent ?? null,
          payload,
        }
      : record;
  writeFileSync(pathFor(record.id), JSON.stringify(stored, null, 2), "utf8");
}

export async function getUserMeeting(id: string): Promise<UserMeetingRecord | null> {
  if (!safeMeetingId(id)) return null;
  if (USE_DATABASE) {
    const row = await prisma.userMeetingRecord.findUnique({ where: { id } });
    const record = row
      ? await recordFromStoredPayload({
          id: row.id,
          userId: row.userId,
          workspace: row.workspace,
          phase: row.phase,
          progressPercent: row.progressPercent,
          payload: row.payload,
        })
      : null;
    return normalizeSpeakerPresentation(record);
  }
  const p = pathFor(id);
  if (!existsSync(p)) return null;
  try {
    const stored = JSON.parse(readFileSync(p, "utf8")) as unknown;
    if (
      stored &&
      typeof stored === "object" &&
      !Array.isArray(stored) &&
      "payload" in stored
    ) {
      const wrapper = stored as {
        id: string;
        userId: string;
        workspace: string;
        phase: string;
        progressPercent: number | null;
        payload: Prisma.JsonValue;
      };
      return normalizeSpeakerPresentation(await recordFromStoredPayload(wrapper));
    }
    return normalizeSpeakerPresentation(stored as UserMeetingRecord);
  } catch {
    return null;
  }
}

export async function listUserMeetings(
  userId?: string,
): Promise<UserMeetingRecord[]> {
  if (USE_DATABASE) {
    const rows = await prisma.userMeetingRecord.findMany({
      where: userId ? { userId } : undefined,
      orderBy: { createdAt: "desc" },
    });
    return (
      await Promise.all(
        rows.map((row) =>
          recordFromStoredPayload({
            id: row.id,
            userId: row.userId,
            workspace: row.workspace,
            phase: row.phase,
            progressPercent: row.progressPercent,
            payload: row.payload,
          }),
        ),
      ))
      .filter((row): row is UserMeetingRecord => Boolean(row))
      .map((row) => normalizeSpeakerPresentation(row)!)
  }
  ensureRoot();
  const files = readdirSync(ROOT).filter((f) => f.endsWith(".json"));
  const rows: UserMeetingRecord[] = [];
  for (const f of files) {
    try {
      const stored = JSON.parse(
        readFileSync(join(ROOT, f), "utf8"),
      ) as unknown;
      const row =
        stored &&
        typeof stored === "object" &&
        !Array.isArray(stored) &&
        "payload" in stored
          ? await recordFromStoredPayload(
              stored as {
                id: string;
                userId: string;
                workspace: string;
                phase: string;
                progressPercent: number | null;
                payload: Prisma.JsonValue;
              },
            )
          : (stored as UserMeetingRecord);
      if (!row) continue;
      if (userId && row.userId !== userId) continue;
      rows.push(normalizeSpeakerPresentation(row)!);
    } catch {
      // skip corrupt
    }
  }
  return rows.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function updateUserMeeting(
  id: string,
  patch: Partial<UserMeetingRecord>,
): Promise<UserMeetingRecord | null> {
  const cur = await getUserMeeting(id);
  if (!cur) return null;
  const next: UserMeetingRecord = {
    ...cur,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await saveUserMeeting(next);
  return next;
}

/** 진행률은 감소하지 않음. phase도 같이 갱신 가능. */
export async function setMeetingProgress(
  id: string,
  percent: number,
  patch: Partial<
    Pick<
      UserMeetingRecord,
      "phase" | "errorMessage" | "rawText" | "stageLabel"
    >
  > = {},
): Promise<UserMeetingRecord | null> {
  const cur = await getUserMeeting(id);
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

export async function healStaleProcessingMeeting(
  id: string,
  nowMs: number = Date.now(),
): Promise<UserMeetingRecord | null> {
  const cur = await getUserMeeting(id);
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
  const dir = join(WORK_ROOT, safe);
  if (!existsSync(dir)) return;
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // 작업 폴더 잔존은 기록 삭제보다 덜 치명적이라 조용히 넘긴다.
  }
}

export async function deleteUserMeeting(id: string): Promise<boolean> {
  if (!safeMeetingId(id)) return false;
  if (USE_DATABASE) {
    const deleted = await prisma.$transaction(async (tx) => {
      const result = await tx.userMeetingRecord.deleteMany({ where: { id } });
      if (result.count === 0) return false;
      await tx.analysisJob.deleteMany({ where: { meetingId: id } });
      await tx.analysisUsage.updateMany({
        where: { meetingId: id, status: "RESERVED" },
        data: { status: "RELEASED" },
      });
      await tx.aiUsageEvent.deleteMany({ where: { meetingId: id } });
      await tx.pipelineAttempt.deleteMany({ where: { meetingId: id } });
      return true;
    });
    if (deleted) removeMeetingWorkDir(id);
    return deleted;
  }
  const p = pathFor(id);
  if (!existsSync(p)) return false;
  try {
    unlinkSync(p);
    await prisma.analysisUsage.updateMany({
      where: { meetingId: id, status: "RESERVED" },
      data: { status: "RELEASED" },
    });
    try {
      await deleteAiUsageForMeeting(id);
      await deletePipelineAttemptsForMeeting(id);
    } catch {
      // The meeting record is already gone; leave operational-log cleanup
      // for the next retention run if a local log is temporarily unavailable.
    }
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
export async function findExpiredUserMeetings(
  userId: string,
  retentionDays: number,
  now: Date = new Date(),
): Promise<UserMeetingRecord[]> {
  const days = Math.max(1, Math.floor(retentionDays));
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  const rows = await listUserMeetings(userId);
  return rows.filter((row) => {
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
export async function purgeExpiredUserMeetings(
  userId: string,
  retentionDays: number,
  now: Date = new Date(),
  options?: { max?: number },
): Promise<{ deleted: number; remaining: number }> {
  const max = Math.max(1, options?.max ?? PURGE_USER_MEETINGS_MAX_PER_RUN);
  const expired = await findExpiredUserMeetings(userId, retentionDays, now);
  const batch = expired.slice(0, max);
  let deleted = 0;
  for (const row of batch) {
    if (await deleteUserMeeting(row.id)) deleted += 1;
  }
  return { deleted, remaining: Math.max(0, expired.length - batch.length) };
}

export function workDirForMeeting(meetingId: string) {
  const safe = safeMeetingId(meetingId);
  if (!safe) throw new Error("잘못된 회의 id입니다.");
  const dir = join(WORK_ROOT, safe);
  mkdirSync(dir, { recursive: true });
  return dir;
}
