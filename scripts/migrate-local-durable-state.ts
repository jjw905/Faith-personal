import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { AnalysisMode } from "@prisma/client";

config({ path: ".env.local" });
config();

const { prisma } = await import("../src/lib/prisma");

const dataRoot = resolve(process.env.FAITH_DATA_DIR?.trim() || ".data");
const meetingsRoot = join(dataRoot, "user-meetings");
const usageLog = join(dataRoot, "ai-usage", "events.jsonl");
const pipelineLog = join(dataRoot, "pipeline-stats", "events.jsonl");

type MigrationSummary = {
  imported: number;
  skipped: number;
  failed: number;
};

function dateOrNow(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function positiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
}

function optionalInt(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
}

async function importMeetingRecords(summary: MigrationSummary) {
  let files: string[] = [];
  try {
    files = (await readdir(meetingsRoot)).filter((file) => file.endsWith(".json"));
  } catch {
    return;
  }

  for (const file of files) {
    try {
      const payload = JSON.parse(
        await readFile(join(meetingsRoot, file), "utf8"),
      ) as {
        id?: unknown;
        userId?: unknown;
        workspace?: unknown;
        phase?: unknown;
        progressPercent?: unknown;
        createdAt?: unknown;
        updatedAt?: unknown;
      };
      const id = String(payload.id ?? "").trim();
      const userId = String(payload.userId ?? "").trim();
      const workspace = String(payload.workspace ?? "").trim();
      const phase = String(payload.phase ?? "").trim();
      if (!id || !userId || !workspace || !phase) {
        summary.skipped += 1;
        continue;
      }
      const updatedAt = dateOrNow(payload.updatedAt);
      const existing = await prisma.userMeetingRecord.findUnique({
        where: { id },
        select: { updatedAt: true },
      });
      if (existing && existing.updatedAt >= updatedAt) {
        summary.skipped += 1;
        continue;
      }
      await prisma.userMeetingRecord.upsert({
        where: { id },
        create: {
          id,
          userId,
          workspace,
          phase,
          progressPercent: optionalInt(payload.progressPercent),
          payload: payload as never,
          createdAt: dateOrNow(payload.createdAt),
          updatedAt,
        },
        update: {
          userId,
          workspace,
          phase,
          progressPercent: optionalInt(payload.progressPercent),
          payload: payload as never,
          updatedAt,
        },
      });
      summary.imported += 1;
    } catch {
      summary.failed += 1;
    }
  }
}

async function importUsageEvents(summary: MigrationSummary) {
  let raw: string;
  try {
    raw = await readFile(usageLog, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const id = String(event.id ?? "").trim();
      const meetingId = String(event.meetingId ?? "").trim();
      const userId = String(event.userId ?? "").trim();
      if (!id || !meetingId || !userId) {
        summary.skipped += 1;
        continue;
      }
      await prisma.aiUsageEvent.upsert({
        where: { id },
        create: {
          id,
          at: dateOrNow(event.at),
          meetingId,
          userId,
          title: typeof event.title === "string" ? event.title : undefined,
          stage: String(event.stage ?? "stt"),
          model: String(event.model ?? "unknown"),
          durationSec: optionalInt(event.durationSec),
          chunkCount: optionalInt(event.chunkCount),
          inputTokens: positiveInt(event.inputTokens),
          outputTokens: positiveInt(event.outputTokens),
          totalTokens: positiveInt(event.totalTokens),
          estimatedUsd: Math.max(0, Number(event.estimatedUsd) || 0),
          billSource: String(event.billSource ?? "mixed"),
        },
        update: {},
      });
      summary.imported += 1;
    } catch {
      summary.failed += 1;
    }
  }
}

async function importPipelineAttempts(summary: MigrationSummary) {
  let raw: string;
  try {
    raw = await readFile(pipelineLog, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split("\n").filter(Boolean)) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const id = String(event.id ?? "").trim();
      const meetingId = String(event.meetingId ?? "").trim();
      const userId = String(event.userId ?? "").trim();
      if (!id || !meetingId || !userId) {
        summary.skipped += 1;
        continue;
      }
      const mode = String(event.analysisMode ?? "").toLowerCase();
      await prisma.pipelineAttempt.upsert({
        where: { id },
        create: {
          id,
          at: dateOrNow(event.at),
          meetingId,
          userId,
          model: String(event.model ?? "unknown"),
          analysisMode:
            mode === "precision"
              ? AnalysisMode.PRECISION
              : mode === "standard"
                ? AnalysisMode.STANDARD
                : undefined,
          durationSec: optionalInt(event.durationSec),
          chargedSec: optionalInt(event.chargedSec),
          speakerCount: optionalInt(event.speakerCount),
          outcome: String(event.outcome ?? "error"),
          failedStage:
            typeof event.failedStage === "string"
              ? event.failedStage
              : undefined,
          topicBucket:
            typeof event.topicBucket === "string"
              ? event.topicBucket
              : undefined,
        },
        update: {},
      });
      summary.imported += 1;
    } catch {
      summary.failed += 1;
    }
  }
}

async function main() {
  if (process.env.DURABLE_STATE_BACKEND !== "database") {
    throw new Error(
      "DURABLE_STATE_BACKEND=database를 설정한 별도 실행 환경에서만 사용하세요.",
    );
  }

  const summary: MigrationSummary = { imported: 0, skipped: 0, failed: 0 };
  await importMeetingRecords(summary);
  await importUsageEvents(summary);
  await importPipelineAttempts(summary);
  console.log(
    `[durable-state-migration] imported=${summary.imported} skipped=${summary.skipped} failed=${summary.failed}`,
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
