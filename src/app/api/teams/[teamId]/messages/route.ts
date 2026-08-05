import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  createTeamChatMessage,
  listTeamChatMessages,
  TEAM_CHAT_CHANNEL_GENERAL,
} from "@/lib/team-chat";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

type RouteContext = { params: Promise<{ teamId: string }> };

const ALLOWED_CHANNELS = new Set([TEAM_CHAT_CHANNEL_GENERAL]);

async function requireMember(teamId: string, userId: string) {
  return prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
  });
}

function resolveChannel(raw: string | null | undefined) {
  const channel = (raw || TEAM_CHAT_CHANNEL_GENERAL).trim().slice(0, 32);
  if (!ALLOWED_CHANNELS.has(channel)) return null;
  return channel;
}

export async function GET(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { teamId } = await context.params;
  const member = await requireMember(teamId, gate.session.user.id);
  if (!member) {
    return NextResponse.json(
      { ok: false, message: "팀을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const channel = resolveChannel(url.searchParams.get("channel"));
  if (!channel) {
    return NextResponse.json(
      { ok: false, message: "지원하지 않는 채널입니다." },
      { status: 400 },
    );
  }
  const after = url.searchParams.get("after");
  const limit = Number(url.searchParams.get("limit") || "50");
  let afterCreatedAt: Date | null = null;
  let afterId: string | null = null;
  if (after) {
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(after)) {
      return NextResponse.json(
        { ok: false, message: "잘못된 커서입니다." },
        { status: 400 },
      );
    }
    const pivot = await prisma.teamChatMessage.findFirst({
      where: { id: after, teamId, channel },
      select: { id: true, createdAt: true },
    });
    if (pivot) {
      afterCreatedAt = pivot.createdAt;
      afterId = pivot.id;
    }
  }

  const messages = await listTeamChatMessages({
    teamId,
    channel,
    afterCreatedAt,
    afterId,
    limit: Number.isFinite(limit) ? limit : 50,
  });
  return NextResponse.json({ ok: true, messages });
}

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { teamId } = await context.params;
  const member = await requireMember(teamId, gate.session.user.id);
  if (!member) {
    return NextResponse.json(
      { ok: false, message: "팀을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const limit = rateLimit({
    key: `team-chat:${teamId}:${gate.session.user.id}:${clientIp(request)}`,
    limit: 40,
    windowMs: 60_000,
  });
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

  let body: {
    body?: string;
    channel?: string;
    vaultFileId?: string;
    teamMeetingId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const channel = resolveChannel(body.channel);
  if (!channel) {
    return NextResponse.json(
      { ok: false, message: "지원하지 않는 채널입니다." },
      { status: 400 },
    );
  }

  if (body.vaultFileId && body.teamMeetingId) {
    return NextResponse.json(
      {
        ok: false,
        message: "파일과 회의록은 한 번에 하나만 첨부할 수 있습니다.",
      },
      { status: 400 },
    );
  }
  if (body.vaultFileId && !/^[a-zA-Z0-9_-]{8,64}$/.test(body.vaultFileId)) {
    return NextResponse.json(
      { ok: false, message: "파일 첨부가 올바르지 않습니다." },
      { status: 400 },
    );
  }
  if (
    body.teamMeetingId &&
    !/^[a-zA-Z0-9_-]{8,64}$/.test(body.teamMeetingId)
  ) {
    return NextResponse.json(
      { ok: false, message: "회의록 첨부가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const message = await createTeamChatMessage({
      teamId,
      authorId: gate.session.user.id,
      body: body.body,
      channel,
      vaultFileId: body.vaultFileId ?? null,
      teamMeetingId: body.teamMeetingId ?? null,
    });
    return NextResponse.json(
      { ok: true, chatMessage: message },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "메시지를 보내지 못했습니다.";
    const status =
      message.includes("권한") || message.includes("찾을 수 없")
        ? 403
        : message.includes("보안 키")
          ? 503
          : 400;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
