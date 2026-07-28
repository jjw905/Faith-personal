import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { buildGlossary } from "@/lib/stt/glossary";
import { DEFAULT_STT_MODEL } from "@/lib/stt/models";
import { buildSemanticStructure } from "@/lib/stt/semantic-structure";
import {
  attachCorrections,
  suggestTermCorrections,
} from "@/lib/stt/term-suggest";
import { alignDialogueToTimedSegments } from "@/lib/stt/timed-segments";
import {
  buildMeetingFromStt,
  placeholderMeeting,
} from "@/lib/stt/to-meeting";
import { appendAiUsage } from "@/lib/stt/usage-store";
import {
  getUserMeeting,
  saveUserMeeting,
  updateUserMeeting,
  type UserMeetingRecord,
} from "@/lib/user-meetings-store";
import type { WorkspaceId } from "@/lib/workspaces";

const MINI_USD_PER_MINUTE = 0.003;
const TEAM_SETTLE_TIMEOUT_MS = 6_000;
const TEAM_SETTLE_POLL_MS = 200;

export function createLiveMeetingId(): string {
  return `mtg-live-${randomUUID().slice(0, 12)}`;
}

export function ensureLiveMeetingRecord(params: {
  meetingId: string;
  userId: string;
  title: string;
  workspace: WorkspaceId;
  createdAt?: Date;
}) {
  if (getUserMeeting(params.meetingId)) return;
  const createdAt = (params.createdAt ?? new Date()).toISOString();
  const placeholder = placeholderMeeting({
    meetingId: params.meetingId,
    title: params.title,
    workspace: params.workspace,
    date: createdAt,
    capture: "live",
  });
  const record: UserMeetingRecord = {
    id: params.meetingId,
    userId: params.userId,
    model: DEFAULT_STT_MODEL,
    phase: "transcribing",
    progressPercent: 0,
    createdAt,
    updatedAt: createdAt,
    workspace: params.workspace,
    meeting: placeholder.meeting,
    transcript: placeholder.transcript,
    timeline: placeholder.timeline,
  };
  saveUserMeeting(record);
}

export async function persistRealtimeUtterance(params: {
  sessionId: string;
  userId: string;
  itemId: string;
  sequence: number;
  text: string;
  startSec: number;
  endSec?: number;
  confidence?: number;
}) {
  const session = await prisma.realtimeSttSession.findFirst({
    where: {
      id: params.sessionId,
      userId: params.userId,
      status: "ACTIVE",
    },
    select: { id: true, title: true },
  });
  if (!session) throw new Error("실시간 기록 세션을 찾을 수 없습니다.");

  const text = params.text.trim().slice(0, 8_000);
  if (!text) throw new Error("전사 내용이 비어 있습니다.");

  const suggested = await suggestTermCorrections([text], {
    glossary: buildGlossary({ title: session.title }),
    genericDictionary: true,
  });
  const corrections = suggested.suggestions.map((suggestion) => ({
    wrong: suggestion.wrong,
    suggestion: suggestion.suggestion,
    reason: suggestion.reason,
    similarity: suggestion.similarity,
    source: suggestion.source,
  }));

  await prisma.realtimeSttUtterance.upsert({
    where: {
      sessionId_itemId: {
        sessionId: params.sessionId,
        itemId: params.itemId,
      },
    },
    create: {
      sessionId: params.sessionId,
      itemId: params.itemId,
      sequence: Math.max(0, Math.floor(params.sequence)),
      text,
      startSec: Math.max(0, params.startSec),
      endSec:
        typeof params.endSec === "number"
          ? Math.max(params.startSec, params.endSec)
          : null,
      confidence:
        typeof params.confidence === "number"
          ? Math.max(0, Math.min(1, params.confidence))
          : null,
      corrections,
    },
    update: {
      sequence: Math.max(0, Math.floor(params.sequence)),
      text,
      startSec: Math.max(0, params.startSec),
      endSec:
        typeof params.endSec === "number"
          ? Math.max(params.startSec, params.endSec)
          : null,
      confidence:
        typeof params.confidence === "number"
          ? Math.max(0, Math.min(1, params.confidence))
          : null,
      corrections,
    },
  });

  return { corrections, dictionaryUsage: suggested.usage };
}

export async function completeRealtimeSession(params: {
  sessionId: string;
  userId: string;
  durationSec: number;
  finalizeTeam?: boolean;
}) {
  const owned = await prisma.realtimeSttSession.findFirst({
    where: { id: params.sessionId, userId: params.userId },
    include: {
      teamMeeting: {
        select: {
          id: true,
          legacyMeetingId: true,
          teamId: true,
        },
      },
    },
  });
  if (!owned) throw new Error("실시간 기록 세션을 찾을 수 없습니다.");

  const durationSec = Math.max(0, Math.min(6 * 60 * 60, params.durationSec));
  const estimatedUsd = (durationSec / 60) * MINI_USD_PER_MINUTE;
  await prisma.realtimeSttSession.update({
    where: { id: owned.id },
    data: {
      status: "COMPLETED",
      endedAt: new Date(),
      billedAudioSeconds: Math.ceil(durationSec),
      estimatedUsd,
    },
  });

  if (owned.teamMeetingId && !params.finalizeTeam) {
    return {
      meetingId: owned.meetingId,
      href: `/meetings/${owned.meetingId}`,
      finalized: false,
    };
  }

  return finalizeRealtimeRun({
    runId: owned.runId,
    meetingId: owned.meetingId,
    title: owned.title,
    workspace: owned.teamMeetingId ? "team" : "personal",
    ownerUserId: owned.teamMeeting?.legacyMeetingId
      ? getUserMeeting(owned.teamMeeting.legacyMeetingId)?.userId ??
        owned.userId
      : owned.userId,
    teamMeetingId: owned.teamMeetingId ?? undefined,
  });
}

async function waitForTeamSessions(runId: string): Promise<void> {
  const deadline = Date.now() + TEAM_SETTLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const active = await prisma.realtimeSttSession.count({
      where: { runId, status: "ACTIVE" },
    });
    if (active === 0) return;
    await new Promise((resolve) => setTimeout(resolve, TEAM_SETTLE_POLL_MS));
  }
}

export async function completeRealtimeTeamRun(params: {
  teamMeetingId: string;
  ownerUserId: string;
}) {
  const meeting = await prisma.teamMeeting.findUnique({
    where: { id: params.teamMeetingId },
    select: {
      id: true,
      title: true,
      sttRunId: true,
      legacyMeetingId: true,
    },
  });
  if (!meeting?.sttRunId) {
    throw new Error("완료할 팀 기록이 없습니다.");
  }

  await waitForTeamSessions(meeting.sttRunId);
  const sessions = await prisma.realtimeSttSession.findMany({
    where: { runId: meeting.sttRunId },
    select: {
      id: true,
      meetingId: true,
      status: true,
      startedAt: true,
    },
  });
  if (sessions.length === 0) {
    throw new Error("저장된 팀 전사 세션이 없습니다.");
  }

  const endedAt = new Date();
  await Promise.all(
    sessions
      .filter((session) => session.status === "ACTIVE")
      .map((session) => {
        const durationSec = Math.max(
          0,
          Math.min(
            6 * 60 * 60,
            (endedAt.getTime() - session.startedAt.getTime()) / 1000,
          ),
        );
        return prisma.realtimeSttSession.updateMany({
          where: { id: session.id, status: "ACTIVE" },
          data: {
            status: "COMPLETED",
            endedAt,
            billedAudioSeconds: Math.ceil(durationSec),
            estimatedUsd: (durationSec / 60) * MINI_USD_PER_MINUTE,
          },
        });
      }),
  );

  const meetingId =
    meeting.legacyMeetingId ?? sessions[0]?.meetingId ?? `mtg-live-${meeting.id}`;
  return finalizeRealtimeRun({
    runId: meeting.sttRunId,
    meetingId,
    title: meeting.title,
    workspace: "team",
    ownerUserId: params.ownerUserId,
    teamMeetingId: meeting.id,
  });
}

async function finalizeRealtimeRun(params: {
  runId: string;
  meetingId: string;
  title: string;
  workspace: WorkspaceId;
  ownerUserId: string;
  teamMeetingId?: string;
}) {
  const existing = getUserMeeting(params.meetingId);
  if (existing?.phase === "done") {
    return {
      meetingId: params.meetingId,
      href: `/meetings/${params.meetingId}`,
      finalized: true,
    };
  }
  updateUserMeeting(params.meetingId, {
    phase: "structuring",
    progressPercent: 72,
  });

  try {
    const sessions = await prisma.realtimeSttSession.findMany({
      where: { runId: params.runId },
      include: {
        user: { select: { name: true, email: true } },
        utterances: { orderBy: { sequence: "asc" } },
      },
      orderBy: { startedAt: "asc" },
    });
    const earliestMs = Math.min(
      ...sessions.map((session) => session.startedAt.getTime()),
    );
    const rows = sessions
      .flatMap((session) => {
        const offsetSec = Math.max(
          0,
          (session.startedAt.getTime() - earliestMs) / 1000,
        );
        const speaker =
          session.user.name?.trim() ||
          session.user.email?.split("@")[0] ||
          "참석자";
        return session.utterances.map((utterance) => ({
          speaker,
          text: utterance.text.trim(),
          startSec: offsetSec + utterance.startSec,
          endSec:
            offsetSec +
            (utterance.endSec ??
              Math.max(utterance.startSec + 0.2, utterance.startSec)),
        }));
      })
      .filter((row) => row.text)
      .sort((a, b) => a.startSec - b.startSec);

    if (rows.length === 0) {
      throw new Error("저장된 실시간 발화가 없습니다.");
    }

    const durationSec = Math.max(
      0.2,
      ...rows.map((row) => Math.max(row.startSec, row.endSec)),
    );
    const rawText = rows
      .map((row) => `[${row.speaker}] ${row.text}`)
      .join("\n");
    const { structure, usage } = await buildSemanticStructure(
      rawText,
      durationSec,
    );
    const timedSegments = rows.map((row) => ({
      startSec: row.startSec,
      endSec: Math.max(row.startSec + 0.2, row.endSec),
      text: row.text,
    }));
    structure.dialogue = alignDialogueToTimedSegments(
      structure.dialogue,
      timedSegments,
      durationSec,
    );
    if (structure.dialogue.length === 0) {
      throw new Error("실시간 대화기록 생성에 실패했습니다.");
    }

    const built = buildMeetingFromStt({
      meetingId: params.meetingId,
      title: params.title,
      durationSec,
      rawText,
      semantic: structure,
      timedSegments,
      workspace: params.workspace,
      capture: "live",
      date: existing?.createdAt,
    });
    const glossary = buildGlossary({
      userId: params.ownerUserId,
      title: params.title,
      participantNames: [...new Set(rows.map((row) => row.speaker))],
    });
    const suggested = await suggestTermCorrections(
      built.transcript.lines.map((line) => line.text ?? ""),
      {
        glossary,
        keepTerms: rows.map((row) => row.speaker),
      },
    );
    built.transcript.lines = attachCorrections(
      built.transcript.lines,
      suggested.suggestions,
    );

    saveUserMeeting({
      id: params.meetingId,
      userId: params.ownerUserId,
      model: DEFAULT_STT_MODEL,
      phase: "done",
      progressPercent: 100,
      createdAt: existing?.createdAt ?? new Date(earliestMs).toISOString(),
      updatedAt: new Date().toISOString(),
      workspace: params.workspace,
      meeting: built.meeting,
      transcript: built.transcript,
      timeline: built.timeline,
      rawText,
      semantic: structure,
    });

    for (const session of sessions) {
      appendAiUsage({
        meetingId: params.meetingId,
        userId: session.userId,
        title: params.title,
        stage: "stt",
        model: DEFAULT_STT_MODEL,
        durationSec: session.billedAudioSeconds,
        chunkCount: session.utterances.length,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedUsd: Number(session.estimatedUsd),
        billSource: "audio_minutes",
      });
    }
    appendAiUsage({
      meetingId: params.meetingId,
      userId: params.ownerUserId,
      title: params.title,
      stage: "structure",
      model: usage.model,
      durationSec,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedUsd: usage.estimatedUsd,
      billSource: "tokens",
    });

    if (params.teamMeetingId) {
      await prisma.teamMeeting.update({
        where: { id: params.teamMeetingId },
        data: {
          legacyMeetingId: params.meetingId,
          state: "READY",
        },
      });
    }

    return {
      meetingId: params.meetingId,
      href: `/meetings/${params.meetingId}`,
      finalized: true,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "실시간 회의 정리에 실패했습니다.";
    updateUserMeeting(params.meetingId, {
      phase: "error",
      errorMessage: message,
    });
    if (params.teamMeetingId) {
      await prisma.teamMeeting.update({
        where: { id: params.teamMeetingId },
        data: { state: "FAILED" },
      });
    }
    throw error;
  }
}
