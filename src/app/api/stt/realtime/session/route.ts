import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { REALTIME_FEATURE_ENABLED } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { buildGlossary } from "@/lib/stt/glossary";
import { seoulDateKey } from "@/lib/meeting-date";
import {
  createLiveMeetingId,
  ensureLiveMeetingRecord,
} from "@/lib/stt/realtime/live-session-store";
import { REALTIME_STT_MINI } from "@/lib/stt/realtime/types";
import { effectiveHostId } from "@/lib/team/meeting-lifecycle";
import { listUserMeetings } from "@/lib/user-meetings-store";

const CLIENT_SECRET_ENDPOINT =
  "https://api.openai.com/v1/realtime/client_secrets";

export async function POST(request: Request) {
  if (!REALTIME_FEATURE_ENABLED) {
    return NextResponse.json(
      {
        ok: false,
        message: "수요조사 기간에는 실시간 기록을 제공하지 않습니다. 업로드 분석을 이용해 주세요.",
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

  let body: {
    title?: string;
    teamMeetingId?: string;
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
    // ADMIN은 개발·검증용이라 월 무료 한도에서 제외한다.
    if (
      !body.teamMeetingId?.trim() &&
      userSession.user.role !== "ADMIN" &&
      userSession.user.plan === "FREE"
    ) {
      const month = seoulDateKey(new Date().toISOString()).slice(0, 7);
      const meetingsThisMonth = listUserMeetings(userSession.user.id).filter(
        (meeting) => seoulDateKey(meeting.createdAt).startsWith(month),
      ).length;
      if (meetingsThisMonth >= 5) {
        return NextResponse.json(
          { ok: false, message: "이번 달 무료 회의 사용량을 모두 사용했습니다." },
          { status: 429 },
        );
      }
    }
  }

  const requestedTitle = body.title?.trim().slice(0, 120) || "실시간 회의";
  let teamMeetingId = body.teamMeetingId?.trim();
  const reconnectSessionId = body.reconnectSessionId?.trim();
  let meetingId = createLiveMeetingId();
  let runId: string = randomUUID();
  let title = requestedTitle;
  let workspace: "personal" | "team" = "personal";
  let ownerUserId = userSession.user.id;
  let participantNames = userSession.user.name
    ? [userSession.user.name]
    : [];

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
              select: { user: { select: { name: true } } },
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
    meetingId = existing.meetingId;
    runId = existing.runId;
    title = existing.title;
    teamMeetingId = existing.teamMeetingId ?? undefined;
    workspace = existing.teamMeetingId ? "team" : "personal";
    participantNames = [
      ...new Set(
        [
          userSession.user.name?.trim(),
          ...(existing.teamMeeting?.access.map((access) =>
            access.user.name?.trim(),
          ) ?? []),
        ].filter((name): name is string => Boolean(name)),
      ),
    ];
  } else if (teamMeetingId) {
    const teamMeeting = await prisma.teamMeeting.findUnique({
      where: { id: teamMeetingId },
      include: {
        access: {
          where: { isParticipant: true },
          select: {
            userId: true,
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
  }

  const glossary = buildGlossary({
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
    ensureLiveMeetingRecord({
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
