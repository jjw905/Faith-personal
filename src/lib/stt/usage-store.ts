import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { seoulDateKey } from "@/lib/meeting-date";

export type AiUsageStage = "stt" | "structure";

export type AiUsageEvent = {
  id: string;
  at: string;
  meetingId: string;
  userId: string;
  title?: string;
  stage: AiUsageStage;
  model: string;
  durationSec?: number;
  chunkCount?: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedUsd: number;
  billSource: "tokens" | "audio_minutes" | "mixed";
};

const ROOT = join(process.cwd(), ".data", "ai-usage");
const LOG = join(ROOT, "events.jsonl");

function ensureDir() {
  if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true });
}

export function appendAiUsage(
  partial: Omit<AiUsageEvent, "id" | "at"> & { at?: string },
): AiUsageEvent {
  ensureDir();
  const event: AiUsageEvent = {
    id: randomUUID(),
    at: partial.at ?? new Date().toISOString(),
    meetingId: partial.meetingId,
    userId: partial.userId,
    title: partial.title,
    stage: partial.stage,
    model: partial.model,
    durationSec: partial.durationSec,
    chunkCount: partial.chunkCount,
    inputTokens: Math.max(0, Math.round(partial.inputTokens)),
    outputTokens: Math.max(0, Math.round(partial.outputTokens)),
    totalTokens: Math.max(0, Math.round(partial.totalTokens)),
    estimatedUsd: Math.max(0, partial.estimatedUsd),
    billSource: partial.billSource,
  };
  appendFileSync(LOG, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export function listAiUsage(limit = 2000): AiUsageEvent[] {
  if (!existsSync(LOG)) return [];
  const raw = readFileSync(LOG, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const out: AiUsageEvent[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    try {
      out.push(JSON.parse(lines[i]!) as AiUsageEvent);
    } catch {
      // skip bad line
    }
  }
  return out.reverse();
}

export type AiUsageDayBucket = {
  date: string;
  sttUsd: number;
  structureUsd: number;
  totalUsd: number;
  sttKrw: number;
  structureKrw: number;
  totalKrw: number;
  usdKrw: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  audioSec: number;
  jobs: number;
};

export type AiUsageUserBucket = {
  userId: string;
  usd: number;
  krw: number;
  tokens: number;
  jobs: number;
  meetingCount: number;
  audioSec: number;
};

export type AiUsageEventView = AiUsageEvent & {
  estimatedKrw: number;
  usdKrw: number;
};

export type AiUsageFxInfo = {
  latestRate: number;
  latestAsOf: string;
  source: string;
};

export type AiUsageSummary = {
  totalUsd: number;
  sttUsd: number;
  structureUsd: number;
  totalKrw: number;
  sttKrw: number;
  structureKrw: number;
  fx: AiUsageFxInfo | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  eventCount: number;
  meetingCount: number;
  audioMinutes: number;
  byDay: AiUsageDayBucket[];
  byModel: Array<{
    model: string;
    stage: AiUsageStage;
    usd: number;
    krw: number;
    tokens: number;
    count: number;
  }>;
  byUser: AiUsageUserBucket[];
  recent: AiUsageEventView[];
};

function dayKey(iso: string): string {
  return seoulDateKey(iso);
}

/** 사용자, 날짜(from/to inclusive YYYY-MM-DD) 필터. */
export function filterAiUsageEvents(
  events: AiUsageEvent[],
  opts: {
    userId?: string | null;
    from?: string | null;
    to?: string | null;
  } = {},
): AiUsageEvent[] {
  const userId = opts.userId?.trim() || null;
  const from = opts.from?.trim() || null;
  const to = opts.to?.trim() || null;
  return events.filter((e) => {
    if (userId && e.userId !== userId) return false;
    const d = dayKey(e.at);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

export function summarizeAiUsage(
  events: AiUsageEvent[],
  rates?: Map<string, number>,
): AiUsageSummary {
  let sttUsd = 0;
  let structureUsd = 0;
  let sttKrw = 0;
  let structureKrw = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let audioSec = 0;
  const meetings = new Set<string>();
  const dayMap = new Map<string, AiUsageDayBucket>();
  const modelMap = new Map<
    string,
    {
      model: string;
      stage: AiUsageStage;
      usd: number;
      krw: number;
      tokens: number;
      count: number;
    }
  >();
  const userMap = new Map<
    string,
    {
      userId: string;
      usd: number;
      krw: number;
      tokens: number;
      jobs: number;
      meetings: Set<string>;
      audioSec: number;
    }
  >();

  const rateFor = (date: string) => rates?.get(date) ?? 0;

  for (const e of events) {
    meetings.add(e.meetingId);
    inputTokens += e.inputTokens;
    outputTokens += e.outputTokens;
    totalTokens += e.totalTokens;
    const dk = dayKey(e.at);
    const rate = rateFor(dk);
    const krw = e.estimatedUsd * rate;

    if (e.stage === "stt") {
      sttUsd += e.estimatedUsd;
      sttKrw += krw;
      if (typeof e.durationSec === "number") audioSec += e.durationSec;
    } else {
      structureUsd += e.estimatedUsd;
      structureKrw += krw;
    }

    let day = dayMap.get(dk);
    if (!day) {
      day = {
        date: dk,
        sttUsd: 0,
        structureUsd: 0,
        totalUsd: 0,
        sttKrw: 0,
        structureKrw: 0,
        totalKrw: 0,
        usdKrw: rate,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        audioSec: 0,
        jobs: 0,
      };
      dayMap.set(dk, day);
    }
    if (e.stage === "stt") {
      day.sttUsd += e.estimatedUsd;
      day.sttKrw += krw;
      if (typeof e.durationSec === "number") day.audioSec += e.durationSec;
    } else {
      day.structureUsd += e.estimatedUsd;
      day.structureKrw += krw;
    }
    day.totalUsd += e.estimatedUsd;
    day.totalKrw += krw;
    if (rate > 0) day.usdKrw = rate;
    day.inputTokens += e.inputTokens;
    day.outputTokens += e.outputTokens;
    day.totalTokens += e.totalTokens;
    day.jobs += 1;

    const mk = `${e.stage}:${e.model}`;
    let row = modelMap.get(mk);
    if (!row) {
      row = {
        model: e.model,
        stage: e.stage,
        usd: 0,
        krw: 0,
        tokens: 0,
        count: 0,
      };
      modelMap.set(mk, row);
    }
    row.usd += e.estimatedUsd;
    row.krw += krw;
    row.tokens += e.totalTokens;
    row.count += 1;

    let user = userMap.get(e.userId);
    if (!user) {
      user = {
        userId: e.userId,
        usd: 0,
        krw: 0,
        tokens: 0,
        jobs: 0,
        meetings: new Set(),
        audioSec: 0,
      };
      userMap.set(e.userId, user);
    }
    user.usd += e.estimatedUsd;
    user.krw += krw;
    user.tokens += e.totalTokens;
    user.jobs += 1;
    user.meetings.add(e.meetingId);
    if (e.stage === "stt" && typeof e.durationSec === "number") {
      user.audioSec += e.durationSec;
    }
  }

  const byDay = Array.from(dayMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  let fx: AiUsageFxInfo | null = null;
  if (rates && rates.size > 0) {
    const latestDate = [...rates.keys()].sort().at(-1)!;
    const latestRate = rates.get(latestDate) ?? 0;
    if (latestRate > 0) {
      fx = {
        latestRate,
        latestAsOf: latestDate,
        source: "daily",
      };
    }
  }

  return {
    totalUsd: sttUsd + structureUsd,
    sttUsd,
    structureUsd,
    totalKrw: sttKrw + structureKrw,
    sttKrw,
    structureKrw,
    fx,
    inputTokens,
    outputTokens,
    totalTokens,
    eventCount: events.length,
    meetingCount: meetings.size,
    audioMinutes: audioSec / 60,
    byDay,
    byModel: Array.from(modelMap.values()).sort((a, b) => b.usd - a.usd),
    byUser: Array.from(userMap.values())
      .map((u) => ({
        userId: u.userId,
        usd: u.usd,
        krw: u.krw,
        tokens: u.tokens,
        jobs: u.jobs,
        meetingCount: u.meetings.size,
        audioSec: u.audioSec,
      }))
      .sort((a, b) => b.usd - a.usd),
    recent: [...events]
      .reverse()
      .slice(0, 40)
      .map((e) => {
        const rate = rateFor(dayKey(e.at));
        return {
          ...e,
          estimatedKrw: e.estimatedUsd * rate,
          usdKrw: rate,
        };
      }),
  };
}

/** 테스트/시드용. 운영 경로에서는 쓰지 않음. */
export function writeAiUsageSnapshot(events: AiUsageEvent[]) {
  ensureDir();
  writeFileSync(
    LOG,
    events.map((e) => JSON.stringify(e)).join("\n") +
      (events.length ? "\n" : ""),
    "utf8",
  );
}
