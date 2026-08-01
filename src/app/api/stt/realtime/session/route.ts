import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { REALTIME_FEATURE_ENABLED } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { requireUser } from "@/lib/require-user";
import { buildGlossary } from "@/lib/stt/glossary";
import {
  createLiveMeetingId,
  ensureLiveMeetingRecord,
} from "@/lib/stt/realtime/live-session-store";
import { REALTIME_STT_MINI } from "@/lib/stt/realtime/types";
import { effectiveHostId } from "@/lib/team/meeting-lifecycle";
import { getUploadQuotaStatus } from "@/lib/stt/usage-quota";
import {
  getTeamFeatureAccess,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";
import {
  getPersonalRealtimeMeeting,
  isPersonalRealtimeParticipant,
} from "@/lib/personal-realtime";

const CLIENT_SECRET_ENDPOINT =
  "https://api.openai.com/v1/realtime/client_secrets";

export async function POST(request: Request) {
  if (!REALTIME_FEATURE_ENABLED) {
    return NextResponse.json(
      {
        ok: false,
        message: "실시간 기록은 오픈 준비중이에요. 업로드 분석을 이용해 주세요.",
      },
      { status: 403 },
    );
  }

  const userSession = await requireUser();
  if (!userSession) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const sessionLimit = rateLimit({
    key: `realtime-session:${userSession.user.id}:${clientIp(request)}`,
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!sessionLimit.ok) return rateLimitResponse(sessionLimit.retryAfterSec);

  let body: {
    title?: string;
    teamMeetingId?: string;
    personalMeetingId?: string;
    reconnectSessionId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || apiKey === "your_openai_api_key_here") {
    return NextResponse.json(
      { ok: false, message: "실시간 기록 설정을 확인해 주세요." },
      { status: 503 },
    );
  }

  const reconnectRequested = Boolean(body.reconnectSessionId?.trim());

  const requestedTitle = body.title?.trim().slice(0, 120) || "실시간 회의";
  let teamMeetingId = body.teamMeetingId?.trim();
  let personalMeetingId = body.personalMeetingId?.trim();
  const reconnectSessionId = body.reconnectSessionId?.trim();
  let meetingId = createLiveMeetingId();
  let runId: string = randomUUID();
  let title = requestedTitle;
  let workspace: "personal" | "team" = "personal";
  let ownerUserId = userSession.user.id;
  let quotaUserId = userSession.user.id;
  let participantNames = userSession.user.name
    ? [userSession.user.name]
    : [];

  if (teamMeetingId && personalMeetingId) {
    return NextResponse.json(
      { ok: false, message: "팀 회의와 개인 회의를 동시에 지정할 수 없습니다." },
      { status: 400 },
    );
  }

  if (reconnectSessionId) {
    const existing = await prisma.realtimeSttSession.findFirst({
      where: {
        id: reconnectSessionId,
        userId: userSession.user.id,
        status: "ACTIVE",
      },
      include: {
        teamMeeting: {
          include: {
            access: {
              where: { isParticipant: true },
              select: {
                userId: true,
                acknowledgedAt: true,
                user: { select: { name: true } },
              },
            },
          },
        },
        personalMeeting: {
          include: {
            owner: { select: { id: true } },
            access: {
              where: { status: "ACCEPTED" },
              select: {
                userId: true,
                status: true,
                user: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, message: "재연결할 기록 세션을 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    if (existing.teamMeetingId) {
      const teamFeature = await getTeamFeatureAccess(userSession.user.id);
      if (!teamFeature.ok) return teamFeatureFailureResponse(teamFeature);
      if (existing.teamMeeting) {
        const membership = await prisma.teamMember.findUnique({
          where: {
            teamId_userId: {
              teamId: existing.teamMeeting.teamId,
              userId: userSession.user.id,
            },
          },
          select: { id: true },
        });
        if (!membership) {
          return NextResponse.json(
            { ok: false, message: "팀 회의 접근 권한이 없습니다." },
            { status: 403 },
          );
        }
      }
      const existingAccess = existing.teamMeeting?.access.find(
        (access) => access.userId === userSession.user.id,
      );
      if (
        existing.teamMeeting &&
        existing.teamMeeting.organizerId !== userSession.user.id &&
        !existingAccess?.acknowledgedAt
      ) {
        return NextResponse.json(
          {
            ok: false,
            code: "MEETING_ACK_REQUIRED",
            message: "참석 확인 후 실시간 기록에 연결할 수 있습니다.",
          },
          { status: 409 },
        );
      }
    } else if (existing.personalMeetingId) {
      if (
        !existing.personalMeeting ||
        !["LOBBY", "ACTIVE"].includes(existing.personalMeeting.state) ||
        !isPersonalRealtimeParticipant({
          meeting: existing.personalMeeting,
          userId: userSession.user.id,
        })
      ) {
        return NextResponse.json(
          { ok: false, message: "개인 실시간 회의 접근 권한이 없습니다." },
          { status: 403 },
        );
      }
    }
    meetingId = existing.meetingId;
    runId = existing.runId;
    title = existing.title;
    teamMeetingId = existing.teamMeetingId ?? undefined;
    personalMeetingId = existing.personalMeetingId ?? undefined;
    workspace = existing.teamMeetingId ? "team" : "personal";
    quotaUserId = existing.personalMeeting?.owner.id ?? userSession.user.id;
    participantNames = [
      ...new Set(
        [
          userSession.user.name?.trim(),
          ...(existing.teamMeeting?.access.map((access) =>
            access.user.name?.trim(),
          ) ?? []),
          ...(existing.personalMeeting?.access.map((access) =>
            access.user.name?.trim(),
          ) ?? []),
        ].filter((name): name is string => Boolean(name)),
      ),
    ];
  } else if (teamMeetingId) {
    const teamFeature = await getTeamFeatureAccess(userSession.user.id);
    if (!teamFeature.ok) return teamFeatureFailureResponse(teamFeature);
    const teamMeeting = await prisma.teamMeeting.findUnique({
      where: { id: teamMeetingId },
      include: {
        access: {
          where: { isParticipant: true },
          select: {
            userId: true,
            acknowledgedAt: true,
            user: { select: { name: true } },
          },
        },
      },
    });
    if (!teamMeeting || teamMeeting.mode !== "ONLINE") {
      return NextResponse.json(
        { ok: false, message: "팀 회의를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: teamMeeting.teamId,
          userId: userSession.user.id,
        },
      },
      select: { id: true },
    });
    if (!membership) {
      return NextResponse.json(
        { ok: false, message: "팀 회의 접근 권한이 없습니다." },
        { status: 403 },
      );
    }
    const isParticipant =
      teamMeeting.access.some(
        (access) => access.userId === userSession.user.id,
      ) ||
      teamMeeting.organizerId === userSession.user.id ||
      teamMeeting.currentHostId === userSession.user.id;
    if (!isParticipant) {
      return NextResponse.json(
        { ok: false, message: "회의 참가자만 기록할 수 있습니다." },
        { status: 403 },
      );
    }
    const currentAccess = teamMeeting.access.find(
      (access) => access.userId === userSession.user.id,
    );
    if (
      teamMeeting.organizerId !== userSession.user.id &&
      !currentAccess?.acknowledgedAt
    ) {
      return NextResponse.json(
        {
          ok: false,
          code: "MEETING_ACK_REQUIRED",
          message: "참석 확인 후 실시간 기록을 시작할 수 있습니다.",
        },
        { status: 409 },
      );
    }
    if (!teamMeeting.recordingActive || !teamMeeting.sttRunId) {
      return NextResponse.json(
        { ok: false, message: "주최자가 기록을 시작하지 않았습니다." },
        { status: 409 },
      );
    }

    workspace = "team";
    title = teamMeeting.title;
    runId = teamMeeting.sttRunId;
    participantNames = [
      ...new Set(
        [
          userSession.user.name?.trim(),
          ...teamMeeting.access.map((access) => access.user.name?.trim()),
        ].filter((name): name is string => Boolean(name)),
      ),
    ];
    meetingId =
      teamMeeting.legacyMeetingId || `mtg-live-${teamMeeting.id}`;
    ownerUserId = effectiveHostId(teamMeeting);
    if (!teamMeeting.legacyMeetingId) {
      await prisma.teamMeeting.update({
        where: { id: teamMeeting.id },
        data: { legacyMeetingId: meetingId },
      });
    }
  } else if (personalMeetingId) {
    const personalMeeting = await getPersonalRealtimeMeeting(personalMeetingId);
    if (!personalMeeting) {
      return NextResponse.json(
        { ok: false, message: "개인 실시간 회의를 찾을 수 없습니다." },
        { status: 404 },
      );
    }
    if (!["LOBBY", "ACTIVE"].includes(personalMeeting.state)) {
      return NextResponse.json(
        { ok: false, message: "이미 종료된 개인 실시간 회의입니다." },
        { status: 409 },
      );
    }
    if (
      !isPersonalRealtimeParticipant({
        meeting: personalMeeting,
        userId: userSession.user.id,
      })
    ) {
      return NextResponse.json(
        { ok: false, message: "개인 실시간 회의 참가 권한이 없습니다." },
        { status: 403 },
      );
    }
    workspace = "personal";
    title = personalMeeting.title;
    runId = personalMeeting.runId;
    meetingId = personalMeeting.legacyMeetingId ?? `mtg-live-${personalMeeting.id}`;
    ownerUserId = personalMeeting.ownerId;
    quotaUserId = personalMeeting.ownerId;
    participantNames = [
      ...new Set(
        personalMeeting.access
          .filter((access) => access.status === "ACCEPTED")
          .map((access) => access.user.name?.trim())
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    if (!personalMeeting.legacyMeetingId) {
      await prisma.personalRealtimeMeeting.update({
        where: { id: personalMeeting.id },
        data: { legacyMeetingId: meetingId },
      });
    }
  }

  if (!reconnectRequested) {
    const activeSessions = await prisma.realtimeSttSession.count({
      where: { userId: userSession.user.id, status: "ACTIVE" },
    });
    if (activeSessions > 0) {
      return NextResponse.json(
        { ok: false, message: "이미 진행 중인 실시간 기록이 있습니다." },
        { status: 409 },
      );
    }
    if (!teamMeetingId) {
      const quota = await getUploadQuotaStatus(quotaUserId);
      if (quota.enforced && quota.remainingSec <= 0) {
        return NextResponse.json(
          {
            ok: false,
            code: "ANALYSIS_GRACE_EXHAUSTED",
            message:
              "분 잔량과 5분 유예를 모두 사용했습니다. 분 팩 구매 후 다시 시작해 주세요.",
          },
          { status: 429 },
        );
      }
    }
  }

  const glossary = await buildGlossary({
    userId: userSession.user.id,
    title,
    participantNames,
  });
  const prompt = glossary.length
    ? `회의에 나오는 표기: ${glossary.join(", ")}`
    : undefined;
  const safetyIdentifier = createHash("sha256")
    .update(userSession.user.id)
    .digest("hex");
  const tokenResponse = await fetch(CLIENT_SECRET_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": safetyIdentifier,
    },
    body: JSON.stringify({
      session: {
        type: "transcription",
        include: ["item.input_audio_transcription.logprobs"],
        audio: {
          input: {
            noise_reduction: { type: "near_field" },
            transcription: {
              model: REALTIME_STT_MINI,
              language: "ko",
              ...(prompt ? { prompt } : {}),
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 600,
            },
          },
        },
      },
    }),
  });
  const tokenBody = (await tokenResponse.json()) as {
    value?: string;
    client_secret?: { value?: string };
    error?: { message?: string };
  };
  const clientSecret =
    tokenBody.value?.trim() || tokenBody.client_secret?.value?.trim();
  if (!tokenResponse.ok || !clientSecret) {
    console.error(
      "[realtime] client secret 발급 실패",
      tokenResponse.status,
      tokenBody.error?.message || "unknown",
    );
    return NextResponse.json(
      { ok: false, message: "실시간 기록 연결을 준비하지 못했습니다." },
      { status: 502 },
    );
  }

  let liveSessionId = reconnectSessionId;
  if (!liveSessionId) {
    await ensureLiveMeetingRecord({
      meetingId,
      title,
      userId: ownerUserId,
      workspace,
    });
    const liveSession = await prisma.realtimeSttSession.create({
      data: {
        meetingId,
        runId,
        userId: userSession.user.id,
        teamMeetingId: teamMeetingId || null,
        personalMeetingId: personalMeetingId || null,
        title,
      },
    });
    liveSessionId = liveSession.id;
  }

  return NextResponse.json({
    ok: true,
    sessionId: liveSessionId,
    meetingId,
    clientSecret,
    model: REALTIME_STT_MINI,
    href: `/meetings/${meetingId}`,
  });
}
