import {
  existsSync,
  mkdirSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { AnalysisMode as PrismaAnalysisMode } from "@prisma/client";

import type { TopicBucket } from "@/lib/stt/semantic-structure";
import type { AnalysisMode } from "@/lib/stt/analysis-mode";
import { faithDataPath } from "@/lib/faith-data-root";
import { prisma } from "@/lib/prisma";

/**
 * 회의 처리 1건의 결과만 남기는 통계 전용 로그.
 *
 * 절대 넣지 않는 것: 회의 제목, 발화자 이름, 원문, 요약, 키워드 등 내용에
 * 해당하는 모든 값. 여기 남기는 값은 실패율 집계에 필요한 메타데이터
 * (모델, 길이대, 화자 수, 실패 단계, 대분류 라벨)뿐이다.
 */
export type PipelineOutcome =
  | "done"
  | "canceled"
  | "error"
  | "moderation_blocked"
  | "quota_blocked";

export type PipelineFailedStage =
  | "stt"
  | "moderation"
  | "quota"
  | "structure"
  | "other";

export type PipelineAttemptEvent = {
  id: string;
  at: string;
  meetingId: string;
  userId: string;
  model: string;
  analysisMode?: AnalysisMode;
  durationSec?: number;
  chargedSec?: number;
  speakerCount?: number;
  outcome: PipelineOutcome;
  failedStage?: PipelineFailedStage;
  topicBucket?: TopicBucket;
};

const ROOT = faithDataPath("pipeline-stats");
const LOG = join(ROOT, "events.jsonl");
const USE_DATABASE = process.env.DURABLE_STATE_BACKEND === "database";

function ensureDir() {
  if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true });
}

export async function appendPipelineAttempt(
  partial: Omit<PipelineAttemptEvent, "id" | "at"> & { at?: string },
): Promise<PipelineAttemptEvent> {
  const event: PipelineAttemptEvent = {
    id: randomUUID(),
    at: partial.at ?? new Date().toISOString(),
    meetingId: partial.meetingId,
    userId: partial.userId,
    model: partial.model,
    analysisMode: partial.analysisMode,
    durationSec: partial.durationSec,
    chargedSec: partial.chargedSec,
    speakerCount: partial.speakerCount,
    outcome: partial.outcome,
    failedStage: partial.failedStage,
    topicBucket: partial.topicBucket,
  };
  if (USE_DATABASE) {
    await prisma.pipelineAttempt.create({
      data: {
        id: event.id,
        at: new Date(event.at),
        meetingId: event.meetingId,
        userId: event.userId,
        model: event.model,
        analysisMode:
          event.analysisMode === "precision"
            ? PrismaAnalysisMode.PRECISION
            : event.analysisMode === "standard"
              ? PrismaAnalysisMode.STANDARD
              : null,
        durationSec: event.durationSec,
        chargedSec: event.chargedSec,
        speakerCount: event.speakerCount,
        outcome: event.outcome,
        failedStage: event.failedStage,
        topicBucket: event.topicBucket,
      },
    });
    return event;
  }
  ensureDir();
  appendFileSync(LOG, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export async function listPipelineAttempts(
  limit = 5000,
): Promise<PipelineAttemptEvent[]> {
  if (USE_DATABASE) {
    const rows = await prisma.pipelineAttempt.findMany({
      orderBy: { at: "desc" },
      take: Math.max(1, Math.floor(limit)),
    });
    return rows.reverse().map((row) => ({
      id: row.id,
      at: row.at.toISOString(),
      meetingId: row.meetingId,
      userId: row.userId,
      model: row.model,
      analysisMode: row.analysisMode
        ? (row.analysisMode.toLowerCase() as AnalysisMode)
        : undefined,
      durationSec: row.durationSec ?? undefined,
      chargedSec: row.chargedSec ?? undefined,
      speakerCount: row.speakerCount ?? undefined,
      outcome: row.outcome as PipelineOutcome,
      failedStage: row.failedStage
        ? (row.failedStage as PipelineFailedStage)
        : undefined,
      topicBucket: row.topicBucket as TopicBucket | undefined,
    }));
  }
  if (!existsSync(LOG)) return [];
  const raw = readFileSync(LOG, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const out: PipelineAttemptEvent[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    try {
      out.push(JSON.parse(lines[i]!) as PipelineAttemptEvent);
    } catch {
      // skip bad line
    }
  }
  return out.reverse();
}

export async function deletePipelineAttemptsForMeeting(
  meetingId: string,
): Promise<number> {
  if (USE_DATABASE) {
    const result = await prisma.pipelineAttempt.deleteMany({
      where: { meetingId },
    });
    return result.count;
  }
  if (!existsSync(LOG)) return 0;
  const kept: string[] = [];
  let deleted = 0;
  for (const line of readFileSync(LOG, "utf8").split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line) as Partial<PipelineAttemptEvent>;
      if (event.meetingId === meetingId) {
        deleted += 1;
        continue;
      }
    } catch {
      // Preserve malformed historical lines for manual inspection.
    }
    kept.push(line);
  }
  if (deleted > 0) {
    writeFileSync(LOG, kept.length > 0 ? `${kept.join("\n")}\n` : "", "utf8");
  }
  return deleted;
}

export async function purgePipelineAttemptsForUserBefore(
  userId: string,
  cutoff: Date,
): Promise<number> {
  if (USE_DATABASE) {
    const result = await prisma.pipelineAttempt.deleteMany({
      where: { userId, at: { lt: cutoff } },
    });
    return result.count;
  }
  if (!existsSync(LOG)) return 0;
  const kept: string[] = [];
  let deleted = 0;
  for (const line of readFileSync(LOG, "utf8").split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line) as Partial<PipelineAttemptEvent>;
      const at = event.at ? Date.parse(event.at) : Number.NaN;
      if (
        event.userId === userId &&
        Number.isFinite(at) &&
        at < cutoff.getTime()
      ) {
        deleted += 1;
        continue;
      }
    } catch {
      // Preserve malformed historical lines for manual inspection.
    }
    kept.push(line);
  }
  if (deleted > 0) {
    writeFileSync(LOG, kept.length > 0 ? `${kept.join("\n")}\n` : "", "utf8");
  }
  return deleted;
}

export const DURATION_BUCKETS = ["0-10", "10-30", "30-60", "60+"] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number];

export function durationBucketOf(durationSec?: number): DurationBucket | "unknown" {
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec)) {
    return "unknown";
  }
  const min = durationSec / 60;
  if (min < 10) return "0-10";
  if (min < 30) return "10-30";
  if (min <= 60) return "30-60";
  return "60+";
}

export const SPEAKER_BUCKETS = ["1", "2-3", "4-6", "7+"] as const;
export type SpeakerBucket = (typeof SPEAKER_BUCKETS)[number];

export function speakerBucketOf(speakerCount?: number): SpeakerBucket | "unknown" {
  if (typeof speakerCount !== "number" || !Number.isFinite(speakerCount)) {
    return "unknown";
  }
  if (speakerCount <= 1) return "1";
  if (speakerCount <= 3) return "2-3";
  if (speakerCount <= 6) return "4-6";
  return "7+";
}

type CountMap<K extends string> = Partial<Record<K, number>>;

function bump<K extends string>(map: CountMap<K>, key: K) {
  map[key] = (map[key] ?? 0) + 1;
}

export type PipelineStatsSummary = {
  total: number;
  done: number;
  error: number;
  moderationBlocked: number;
  /** 쿼터 소진으로 막힌 시도. 시스템 오류가 아니라 정책상 정상 동작이므로 failureRate에는 넣지 않는다. */
  quotaBlocked: number;
  failureRate: number;
  byFailedStage: CountMap<PipelineFailedStage | "unknown">;
  byModel: CountMap<string>;
  byDurationBucket: CountMap<DurationBucket | "unknown">;
  bySpeakerBucket: CountMap<SpeakerBucket | "unknown">;
  byTopicBucket: CountMap<TopicBucket | "unknown">;
  /** 모델 × 실패단계 교차표. "긴 녹음+mini 모델에서 구조화 실패가 많다" 같은 상관관계용. */
  byModelAndStage: Record<string, CountMap<PipelineFailedStage | "unknown">>;
  byDurationAndStage: Record<string, CountMap<PipelineFailedStage | "unknown">>;
};

export function summarizePipelineStats(
  events: PipelineAttemptEvent[],
): PipelineStatsSummary {
  const summary: PipelineStatsSummary = {
    total: events.length,
    done: 0,
    error: 0,
    moderationBlocked: 0,
    quotaBlocked: 0,
    failureRate: 0,
    byFailedStage: {},
    byModel: {},
    byDurationBucket: {},
    bySpeakerBucket: {},
    byTopicBucket: {},
    byModelAndStage: {},
    byDurationAndStage: {},
  };

  for (const e of events) {
    if (e.outcome === "done") summary.done += 1;
    else if (e.outcome === "moderation_blocked") summary.moderationBlocked += 1;
    else if (e.outcome === "quota_blocked") summary.quotaBlocked += 1;
    else summary.error += 1;

    bump(summary.byModel, e.model);
    bump(summary.byDurationBucket, durationBucketOf(e.durationSec));
    bump(summary.bySpeakerBucket, speakerBucketOf(e.speakerCount));
    bump(summary.byTopicBucket, e.topicBucket ?? "unknown");

    if (e.outcome !== "done" && e.outcome !== "quota_blocked") {
      const stage = e.failedStage ?? "unknown";
      bump(summary.byFailedStage, stage);

      const modelRow = (summary.byModelAndStage[e.model] ??= {});
      bump(modelRow, stage);

      const durKey = durationBucketOf(e.durationSec);
      const durRow = (summary.byDurationAndStage[durKey] ??= {});
      bump(durRow, stage);
    }
  }

  const failed = summary.error + summary.moderationBlocked;
  summary.failureRate = summary.total > 0 ? failed / summary.total : 0;
  return summary;
}

/**
 * 가입일 주기 등 임의 구간 [start, end) 합산. end는 exclusive.
 * 성공/실패 여부와 무관하게 durationSec이 기록된 시도만 합산한다(구조화 단계
 * 실패도 STT 비용은 이미 발생했으므로 쿼터에 포함). 쿼터로 막힌 시도(durationSec
 * 없음)는 비용이 없으니 합산하지 않는다.
 */
export async function sumUserDurationSecInRange(
  userId: string,
  start: Date,
  end: Date,
  events?: PipelineAttemptEvent[],
  excludedMeetingIds?: ReadonlySet<string>,
): Promise<number> {
  const startMs = start.getTime();
  const endMs = end.getTime();
  const all = events ?? (await listPipelineAttempts());
  let total = 0;
  for (const e of all) {
    if (e.userId !== userId) continue;
    if (excludedMeetingIds?.has(e.meetingId)) continue;
    if (typeof e.durationSec !== "number" || !Number.isFinite(e.durationSec)) {
      continue;
    }
    const at = Date.parse(e.at);
    if (!Number.isFinite(at) || at < startMs || at >= endMs) continue;
    total +=
      typeof e.chargedSec === "number" && Number.isFinite(e.chargedSec)
        ? e.chargedSec
        : e.durationSec;
  }
  return total;
}
