import "server-only";

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

import type { Prisma } from "@prisma/client";

import { openSealedJson, sealJson } from "@/lib/crypto/sealed-json";
import { prisma } from "@/lib/prisma";
import {
  isTeamEncryptedEnvelope,
  openTeamJson,
  sealTeamJson,
  teamEncryptionRequired,
} from "@/lib/team-encryption";

const execFileAsync = promisify(execFile);
const RETENTION_HOURS = 24;
const MIN_AUDIO_SEC = 1.2;
const MAX_CLUSTERS = 8;
const DEFAULT_SIMILARITY = 0.68;

type StoredCentroid = { vector: number[] };
type ExtractedEmbedding = {
  model: string;
  durationSec: number;
  wallMs: number;
  embedding: number[];
};

export type RealtimeSpeakerAssignment = {
  clusterId: string;
  label: string;
  similarity: number | null;
  model: string;
};

function rootPath(...parts: string[]) {
  const root = process.env.FAITH_ROOT?.trim() || Reflect.apply(process.cwd, process, []);
  return join(root, ...parts);
}

function pythonExecutable() {
  return (
    process.env.DIARIZATION_PYTHON?.trim() ||
    rootPath(".venv-diarization", "bin", "python3")
  );
}

function trackingEnabled() {
  const value = (process.env.REALTIME_SINGLE_MIC_SPEAKER_TRACKING ?? "1")
    .trim()
    .toLowerCase();
  return !["0", "false", "off"].includes(value);
}

function expiresAt() {
  return new Date(Date.now() + RETENTION_HOURS * 60 * 60 * 1000);
}

function normalize(vector: number[]) {
  const finite = vector.filter(Number.isFinite);
  if (finite.length !== vector.length || vector.length < 16) return null;
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || norm <= 1e-8) return null;
  return vector.map((value) => value / norm);
}

function cosine(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) return -1;
  return left.reduce((sum, value, index) => sum + value * right[index]!, 0);
}

function nextLabel(index: number) {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

async function extractEmbedding(params: {
  audioBytes: Buffer;
  filename: string;
}) {
  const dir = mkdtempSync(join(tmpdir(), "faith-speaker-"));
  const extension = extname(params.filename).replace(/[^.a-z0-9]/gi, "") || ".wav";
  const input = join(dir, `utterance${extension}`);
  try {
    writeFileSync(input, params.audioBytes);
    const { stdout } = await execFileAsync(
      pythonExecutable(),
      [rootPath("ml", "diarization", "diarize.py"), input, "--embedding-only"],
      {
        cwd: rootPath(),
        env: process.env,
        timeout: 45_000,
        maxBuffer: 4 * 1024 * 1024,
        killSignal: "SIGKILL",
      },
    );
    const result = JSON.parse(stdout) as ExtractedEmbedding;
    const embedding = normalize(result.embedding ?? []);
    if (!embedding) throw new Error("유효한 화자 임베딩이 아닙니다.");
    return { ...result, embedding };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function personalEnvelope(vector: number[]): Prisma.InputJsonValue {
  return { sealed: sealJson({ vector } satisfies StoredCentroid) };
}

async function sealCentroid(
  teamId: string | null,
  vector: number[],
): Promise<Prisma.InputJsonValue> {
  if (teamId && teamEncryptionRequired()) {
    return (await sealTeamJson(
      teamId,
      "content",
      { vector } satisfies StoredCentroid as Prisma.JsonObject,
    )) as Prisma.InputJsonValue;
  }
  return personalEnvelope(vector);
}

async function openCentroid(
  teamId: string | null,
  value: Prisma.JsonValue,
): Promise<number[] | null> {
  let stored: StoredCentroid | null = null;
  if (teamId && isTeamEncryptedEnvelope(value)) {
    stored = await openTeamJson<StoredCentroid>(teamId, "content", value);
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    const sealed = (value as { sealed?: unknown }).sealed;
    if (typeof sealed === "string") {
      stored = openSealedJson<StoredCentroid>(sealed);
    }
  }
  return stored ? normalize(stored.vector) : null;
}

/**
 * One VAD utterance becomes one session-local voice cluster. Raw audio is only
 * held in a temporary directory; only the encrypted centroid is retained.
 */
export async function assignRealtimeSpeakerCluster(params: {
  sessionId: string;
  itemId: string;
  audioBytes: Buffer;
  filename: string;
}): Promise<RealtimeSpeakerAssignment | null> {
  if (!trackingEnabled() || params.audioBytes.length <= 44) return null;
  const extracted = await extractEmbedding({
    audioBytes: params.audioBytes,
    filename: params.filename,
  });
  if (extracted.durationSec < MIN_AUDIO_SEC) return null;

  const thresholdValue = Number(process.env.REALTIME_SPEAKER_SIMILARITY);
  const threshold = Number.isFinite(thresholdValue)
    ? Math.max(0.4, Math.min(0.95, thresholdValue))
    : DEFAULT_SIMILARITY;

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.sessionId}))`;
    const session = await tx.realtimeSttSession.findUnique({
      where: { id: params.sessionId },
      select: { id: true, status: true, teamMeeting: { select: { teamId: true } } },
    });
    if (!session || session.status !== "ACTIVE") return null;
    const teamId = session.teamMeeting?.teamId ?? null;
    const clusters = await tx.realtimeSpeakerCluster.findMany({
      where: { sessionId: params.sessionId },
      orderBy: { label: "asc" },
    });

    let best:
      | { row: (typeof clusters)[number]; vector: number[]; similarity: number }
      | undefined;
    for (const row of clusters) {
      const vector = await openCentroid(teamId, row.centroid);
      if (!vector) continue;
      const similarity = cosine(extracted.embedding, vector);
      if (!best || similarity > best.similarity) best = { row, vector, similarity };
    }

    if (best && best.similarity >= threshold) {
      const count = Math.max(1, best.row.sampleCount);
      const merged = normalize(
        best.vector.map(
          (value, index) =>
            (value * count + extracted.embedding[index]!) / (count + 1),
        ),
      )!;
      await tx.realtimeSpeakerCluster.update({
        where: { id: best.row.id },
        data: {
          centroid: await sealCentroid(teamId, merged),
          sampleCount: { increment: 1 },
          totalAudioSec: { increment: extracted.durationSec },
          lastSeenAt: new Date(),
          expiresAt: expiresAt(),
        },
      });
      return {
        clusterId: best.row.id,
        label: best.row.label,
        similarity: best.similarity,
        model: extracted.model,
      };
    }

    if (clusters.length >= MAX_CLUSTERS) return null;
    const label = nextLabel(clusters.length);
    const created = await tx.realtimeSpeakerCluster.create({
      data: {
        sessionId: params.sessionId,
        label,
        centroid: await sealCentroid(teamId, extracted.embedding),
        model: extracted.model,
        totalAudioSec: extracted.durationSec,
        expiresAt: expiresAt(),
      },
    });
    return {
      clusterId: created.id,
      label,
      similarity: best?.similarity ?? null,
      model: extracted.model,
    };
  });
}

/** Delete voiceprints only. Utterance speakerLabel remains as meeting evidence. */
export async function purgeExpiredRealtimeSpeakerClusters(now = new Date()) {
  const result = await prisma.realtimeSpeakerCluster.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  return { deleted: result.count };
}

export const REALTIME_SPEAKER_CLUSTER_POLICY = {
  retentionHours: RETENTION_HOURS,
  minAudioSec: MIN_AUDIO_SEC,
  maxClusters: MAX_CLUSTERS,
  defaultSimilarity: DEFAULT_SIMILARITY,
  rawAudioPersisted: false,
} as const;
