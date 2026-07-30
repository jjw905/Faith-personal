import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { sourceInDictionary } from "@/lib/stt/dict-exists";
import { buildGlossary } from "@/lib/stt/glossary";
import {
  whisperWordTimingsForBytes,
  transcribeMiniAudioOnce,
} from "@/lib/stt/chunked-transcribe";
import { DEFAULT_STT_MODEL } from "@/lib/stt/models";
import { estimateSttUsdFromMinutes } from "@/lib/stt/pricing";
import { buildSemanticStructure } from "@/lib/stt/semantic-structure";
import {
  applySpeakerNames,
  identifySpeakerNames,
} from "@/lib/stt/speaker-names";
import {
  attachCorrections,
  suggestSecondPassCorrections,
  suggestTermCorrections,
  type TermSuggestion,
} from "@/lib/stt/term-suggest";
import {
  alignDialogueToTimedSegments,
  type WordTiming,
} from "@/lib/stt/timed-segments";
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
import { activeLineIndexAt, lineStartSec } from "@/lib/transcript-time";
import type { WorkspaceId } from "@/lib/workspaces";

const MINI_USD_PER_MINUTE = 0.003;
const TEAM_SETTLE_TIMEOUT_MS = 6_000;
const TEAM_SETTLE_POLL_MS = 200;
const SECOND_PASS_CONFIDENCE_MAX = 0.72;

type StoredUtteranceWord = {
  text: string;
  startSec: number;
  endSec: number;
};

function parseStoredWords(value: unknown): StoredUtteranceWord[] {
  if (!Array.isArray(value)) return [];
  const out: StoredUtteranceWord[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const text = String((row as { text?: unknown }).text ?? "").trim();
    const startSec = Number((row as { startSec?: unknown }).startSec);
    const endSec = Number((row as { endSec?: unknown }).endSec);
    if (!text || !Number.isFinite(startSec) || !Number.isFinite(endSec)) continue;
    out.push({
      text,
      startSec: Math.max(0, startSec),
      endSec: Math.max(startSec, endSec),
    });
  }
  return out;
}

function parseStoredCorrections(value: unknown): TermSuggestion[] {
  if (!Array.isArray(value)) return [];
  const out: TermSuggestion[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const wrong = String((row as { wrong?: unknown }).wrong ?? "").trim();
    const suggestion = String(
      (row as { suggestion?: unknown }).suggestion ?? "",
    ).trim();
    if (!wrong || !suggestion) continue;
    const sourceRaw = String((row as { source?: unknown }).source ?? "");
    const source: TermSuggestion["source"] =
      sourceRaw === "glossary" ||
      sourceRaw === "ourmalsam" ||
      sourceRaw === "second-pass"
        ? sourceRaw
        : "dictionary" === sourceRaw
          ? "ourmalsam"
          : "second-pass";
    out.push({
      lineIndex: 0,
      wrong,
      suggestion,
      reason: String((row as { reason?: unknown }).reason ?? ""),
      similarity: Number((row as { similarity?: unknown }).similarity) || 0,
      dictionaryVerified: Boolean(
        (row as { dictionaryVerified?: unknown }).dictionaryVerified,
      ),
      startOffset:
        typeof (row as { startOffset?: unknown }).startOffset === "number"
          ? (row as { startOffset: number }).startOffset
          : 0,
      endOffset:
        typeof (row as { endOffset?: unknown }).endOffset === "number"
          ? (row as { endOffset: number }).endOffset
          : Math.max(0, wrong.length),
      sttLogprob:
        typeof (row as { sttLogprob?: unknown }).sttLogprob === "number"
          ? (row as { sttLogprob: number }).sttLogprob
          : undefined,
      source,
    });
  }
  return out;
}

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
  meanLogprob?: number;
  audioBytes?: Buffer;
  audioFilename?: string;
}) {
  const session = await prisma.realtimeSttSession.findFirst({
    where: {
      id: params.sessionId,
      userId: params.userId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      title: true,
      meetingId: true,
      user: { select: { name: true } },
      teamMeeting: {
        select: {
          access: {
            where: { isParticipant: true },
            select: { user: { select: { name: true } } },
          },
        },
      },
    },
  });
  if (!session) throw new Error("실시간 기록 세션을 찾을 수 없습니다.");

  const text = params.text.trim().slice(0, 8_000);
  if (!text) throw new Error("받아쓰기 내용이 비어 있습니다.");

  const existing = await prisma.realtimeSttUtterance.findUnique({
    where: {
      sessionId_itemId: {
        sessionId: params.sessionId,
        itemId: params.itemId,
      },
    },
    select: { corrections: true },
  });
  if (existing) {
    return {
      corrections: existing.corrections ?? [],
      dictionaryUsage: {
        model: "ourmalsam",
        inputTokens: 0,
        outputTokens: 0,
        estimatedUsd: 0,
        apiCalls: 0,
        cacheHits: 0,
        failures: 0,
      },
    };
  }

  try {
    await prisma.realtimeSttUtterance.create({
      data: {
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
      meanLogprob:
        typeof params.meanLogprob === "number" ? params.meanLogprob : null,
      corrections: [],
    },
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    if (code !== "P2002") throw error;
    const duplicate = await prisma.realtimeSttUtterance.findUnique({
      where: {
        sessionId_itemId: {
          sessionId: params.sessionId,
          itemId: params.itemId,
        },
      },
      select: { corrections: true },
    });
    return {
      corrections: duplicate?.corrections ?? [],
      dictionaryUsage: {
        model: "ourmalsam",
        inputTokens: 0,
        outputTokens: 0,
        estimatedUsd: 0,
        apiCalls: 0,
        cacheHits: 0,
        failures: 0,
      },
    };
  }

  const participantNames = [
    session.user.name?.trim(),
    ...(session.teamMeeting?.access.map((access) => access.user.name?.trim()) ??
      []),
  ].filter((name): name is string => Boolean(name));
  const glossary = buildGlossary({
    title: session.title,
    participantNames,
  });
  const suggested = await suggestTermCorrections([text], {
    glossary,
    genericDictionary: true,
  });

  let sourceMissing = false;
  const candidateWords = [
    ...new Set(text.match(/[가-힣]{3,12}/g) ?? []),
  ].slice(0, 8);
  for (const word of candidateWords) {
    const exists = await sourceInDictionary(word);
    if (exists === false) {
      sourceMissing = true;
      break;
    }
  }

  let secondPassUsed = false;
  let secondPassSuggestions = [] as ReturnType<
    typeof suggestSecondPassCorrections
  >;
  let wordTimings: StoredUtteranceWord[] = [];
  let timingAudioSec = 0;
  const confidenceLow =
    typeof params.confidence !== "number" ||
    params.confidence < SECOND_PASS_CONFIDENCE_MAX;
  if (params.audioBytes && params.audioBytes.length > 44) {
    try {
      const timed = await whisperWordTimingsForBytes({
        audioBytes: params.audioBytes,
        filename: params.audioFilename || "utterance.wav",
        glossary,
        offsetSec: params.startSec,
      });
      wordTimings = timed.words;
      timingAudioSec = Math.max(0.2, timed.durationBillSec || 0);
      if (timingAudioSec > 0) {
        appendAiUsage({
          meetingId: session.meetingId,
          userId: params.userId,
          title: session.title,
          stage: "stt",
          model: "whisper-1",
          durationSec: timingAudioSec,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedUsd: estimateSttUsdFromMinutes("whisper-1", timingAudioSec),
          billSource: "audio_minutes",
        });
      }
    } catch (error) {
      console.warn("[realtime] 단어 타임스탬프 건너뜀", error);
    }

    if (confidenceLow || sourceMissing) {
      try {
        const retry = await transcribeMiniAudioOnce({
          audioBytes: params.audioBytes,
          filename: params.audioFilename || "utterance.wav",
          glossary,
        });
        secondPassUsed = true;
        secondPassSuggestions = suggestSecondPassCorrections({
          original: text,
          secondPass: retry.text,
          glossary,
          sttLogprob: params.meanLogprob,
        });
      } catch (error) {
        console.warn("[realtime] 조건부 mini 재전사 건너뜀", error);
      }
    }
  }

  const seen = new Set<string>();
  const corrections = [...suggested.suggestions, ...secondPassSuggestions]
    .filter((suggestion) => {
      const key = `${suggestion.wrong}:${suggestion.suggestion}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((suggestion) => ({
      wrong: suggestion.wrong,
      suggestion: suggestion.suggestion,
      reason: suggestion.reason,
      similarity: suggestion.similarity,
      dictionaryVerified: suggestion.dictionaryVerified,
      startOffset: suggestion.startOffset,
      endOffset: suggestion.endOffset,
      sttLogprob: suggestion.sttLogprob ?? params.meanLogprob,
      source: suggestion.source,
    }));

  const secondPassSeconds = secondPassUsed
    ? Math.max(
        1,
        Math.ceil(
          Math.min(
            35,
            Math.max(0, (params.endSec ?? params.startSec) - params.startSec) +
              0.45,
          ),
        ),
      )
    : 0;
  await prisma.$transaction([
    prisma.realtimeSttUtterance.update({
      where: {
        sessionId_itemId: {
          sessionId: params.sessionId,
          itemId: params.itemId,
        },
      },
      data: {
        corrections,
        secondPass: secondPassUsed,
        words: wordTimings,
      },
    }),
    ...(secondPassSeconds > 0
      ? [
          prisma.realtimeSttSession.update({
            where: { id: params.sessionId },
            data: {
              secondPassSeconds: { increment: secondPassSeconds },
            },
          }),
        ]
      : []),
  ]);

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
  const estimatedUsd =
    ((durationSec + owned.secondPassSeconds) / 60) * MINI_USD_PER_MINUTE;
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
      secondPassSeconds: true,
    },
  });
  if (sessions.length === 0) {
    throw new Error("저장된 팀 받아쓰기 세션이 없습니다.");
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
            estimatedUsd:
              ((durationSec + session.secondPassSeconds) / 60) *
              MINI_USD_PER_MINUTE,
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
        return session.utterances.map((utterance) => {
          const words = parseStoredWords(utterance.words).map((word) => ({
            text: word.text,
            startSec: offsetSec + word.startSec,
            endSec: offsetSec + word.endSec,
          }));
          return {
            speaker,
            text: utterance.text.trim(),
            startSec: offsetSec + utterance.startSec,
            endSec:
              offsetSec +
              (utterance.endSec ??
                Math.max(utterance.startSec + 0.2, utterance.startSec)),
            confidence:
              typeof utterance.confidence === "number"
                ? utterance.confidence
                : undefined,
            corrections: parseStoredCorrections(utterance.corrections),
            words,
          };
        });
      })
      .filter((row) => row.text)
      .sort((a, b) => a.startSec - b.startSec);

    if (rows.length === 0) {
      // 실패가 아니라 "감지된 음성 없음". 기술적 오류가 아니므로 error가 아닌
      // 별도 phase로 남기고, 팀 회의 상태는 이미 ENDED이므로 건드리지 않는다.
      updateUserMeeting(params.meetingId, {
        phase: "empty",
        errorMessage: "감지된 음성이 없어 저장되지 않았습니다.",
      });
      return {
        meetingId: params.meetingId,
        href: `/meetings/${params.meetingId}`,
        finalized: true,
      };
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
      confidence: row.confidence,
    }));
    structure.dialogue = alignDialogueToTimedSegments(
      structure.dialogue,
      timedSegments,
      durationSec,
    );
    if (structure.dialogue.length === 0) {
      throw new Error("실시간 대화기록 생성에 실패했습니다.");
    }

    try {
      const named = await identifySpeakerNames({ dialogue: structure.dialogue });
      applySpeakerNames(structure, named.guesses);
      if (named.usage.inputTokens > 0) {
        appendAiUsage({
          meetingId: params.meetingId,
          userId: params.ownerUserId,
          title: params.title,
          stage: "structure",
          model: named.usage.model,
          durationSec,
          inputTokens: named.usage.inputTokens,
          outputTokens: named.usage.outputTokens,
          totalTokens: named.usage.inputTokens + named.usage.outputTokens,
          estimatedUsd: named.usage.estimatedUsd,
          billSource: "tokens",
        });
      }
    } catch (err) {
      console.warn("[realtime] 화자 실명 추정 실패", err);
    }

    const wordTimings: WordTiming[] = rows.flatMap((row) => row.words);
    const built = buildMeetingFromStt({
      meetingId: params.meetingId,
      title: params.title,
      durationSec,
      rawText,
      semantic: structure,
      timedSegments,
      wordTimings,
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
        genericDictionary: true,
      },
    );
    const liveCorrections = rows.flatMap((row) => {
      const lineIndex = activeLineIndexAt(
        built.transcript.lines.map(lineStartSec),
        row.startSec,
      );
      return row.corrections.map((correction) => ({
        ...correction,
        lineIndex,
      }));
    });
    built.transcript.lines = attachCorrections(built.transcript.lines, [
      ...suggested.suggestions,
      ...liveCorrections,
    ]);

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
