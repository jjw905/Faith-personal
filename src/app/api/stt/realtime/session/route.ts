import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { buildGlossary } from "@/lib/stt/glossary";
import {
  createLiveMeetingId,
  ensureLiveMeetingRecord,
} from "@/lib/stt/realtime/live-session-store";
import { REALTIME_STT_MINI } from "@/lib/stt/realtime/types";
import { effectiveHostId } from "@/lib/team/meeting-lifecycle";

const CLIENT_SECRET_ENDPOINT =
  "https://api.openai.com/v1/realtime/client_secrets";

export async function POST(request: Request) {
  const userSession = await requireUser();
  if (!userSession) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  let body: { title?: string; teamMeetingId?: string };
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

  const requestedTitle = body.title?.trim().slice(0, 120) || "실시간 회의";
  const teamMeetingId = body.teamMeetingId?.trim();
  let meetingId = createLiveMeetingId();
  let runId: string = randomUUID();
  let title = requestedTitle;
  let workspace: "personal" | "team" = "personal";
  let ownerUserId = userSession.user.id;
  let participantNames = userSession.user.name
    ? [userSession.user.name]
    : [];

  if (teamMeetingId) {
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

  ensureLiveMeetingRecord({
    meetingId,
    userId: ownerUserId,
    title,
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

  return NextResponse.json({
    ok: true,
    sessionId: liveSession.id,
    meetingId,
    clientSecret,
    model: REALTIME_STT_MINI,
    href: `/meetings/${meetingId}`,
  });
}
