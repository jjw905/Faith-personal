import "server-only";

import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { openTeamText, sealTeamText } from "@/lib/team-encryption";
import { publishTeamChatEvent } from "@/lib/team-chat-bus";
import { protectUserFileForTeam } from "@/lib/storage/vault-service";

export const TEAM_CHAT_CHANNEL_GENERAL = "general";

export type TeamChatAttachmentType = "vault_file" | "team_meeting";

export type TeamChatAttachmentMeta = {
  name?: string;
  size?: number;
  mime?: string;
  title?: string;
  state?: string;
  endedAt?: string | null;
};

export type PublicTeamChatMessage = {
  id: string;
  teamId: string;
  channel: string;
  body: string;
  attachmentType: TeamChatAttachmentType | null;
  vaultFileId: string | null;
  teamMeetingId: string | null;
  attachmentMeta: TeamChatAttachmentMeta | null;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    handle: string | null;
    image: string | null;
  };
};

type MessageRow = {
  id: string;
  teamId: string;
  channel: string;
  body: string;
  attachmentType: string | null;
  vaultFileId: string | null;
  teamMeetingId: string | null;
  attachmentMeta: unknown;
  createdAt: Date;
  author: {
    id: string;
    name: string | null;
    handle: string | null;
    image: string | null;
  };
};

function asAttachmentType(
  value: string | null | undefined,
): TeamChatAttachmentType | null {
  if (value === "vault_file" || value === "team_meeting") return value;
  return null;
}

function asMeta(value: unknown): TeamChatAttachmentMeta | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as TeamChatAttachmentMeta;
}

export async function toPublicTeamChatMessage(
  row: MessageRow,
): Promise<PublicTeamChatMessage> {
  return {
    id: row.id,
    teamId: row.teamId,
    channel: row.channel,
    body: await openTeamText(row.teamId, "content", row.body),
    attachmentType: asAttachmentType(row.attachmentType),
    vaultFileId: row.vaultFileId,
    teamMeetingId: row.teamMeetingId,
    attachmentMeta: asMeta(row.attachmentMeta),
    createdAt: row.createdAt.toISOString(),
    author: row.author,
  };
}

const messageInclude = {
  author: {
    select: { id: true, name: true, handle: true, image: true },
  },
} as const;

export async function listTeamChatMessages(params: {
  teamId: string;
  channel?: string;
  afterCreatedAt?: Date | null;
  afterId?: string | null;
  beforeCreatedAt?: Date | null;
  limit?: number;
}) {
  const channel = params.channel || TEAM_CHAT_CHANNEL_GENERAL;
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);
  const rows = await prisma.teamChatMessage.findMany({
    where: {
      teamId: params.teamId,
      channel,
      deletedAt: null,
      ...(params.afterCreatedAt
        ? {
            OR: [
              { createdAt: { gt: params.afterCreatedAt } },
              ...(params.afterId
                ? [
                    {
                      createdAt: params.afterCreatedAt,
                      id: { gt: params.afterId },
                    },
                  ]
                : []),
            ],
          }
        : {}),
      ...(params.beforeCreatedAt
        ? { createdAt: { lt: params.beforeCreatedAt } }
        : {}),
    },
    include: messageInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit,
  });
  return Promise.all(rows.map((row) => toPublicTeamChatMessage(row)));
}

export async function createTeamChatMessage(params: {
  teamId: string;
  authorId: string;
  body?: string;
  channel?: string;
  vaultFileId?: string | null;
  teamMeetingId?: string | null;
}) {
  const channel = params.channel || TEAM_CHAT_CHANNEL_GENERAL;
  const text = (params.body ?? "").trim().slice(0, 4000);
  let attachmentType: TeamChatAttachmentType | null = null;
  let vaultFileId: string | null = null;
  let teamMeetingId: string | null = null;
  let attachmentMeta: TeamChatAttachmentMeta | null = null;

  if (params.vaultFileId) {
    const protectedFile = await protectUserFileForTeam({
      userId: params.authorId,
      fileId: params.vaultFileId,
      teamId: params.teamId,
    });
    attachmentType = "vault_file";
    vaultFileId = protectedFile.id;
    attachmentMeta = {
      name: protectedFile.name,
      size: protectedFile.size,
      mime: protectedFile.mime,
    };
  } else if (params.teamMeetingId) {
    const meeting = await prisma.teamMeeting.findFirst({
      where: {
        id: params.teamMeetingId,
        teamId: params.teamId,
      },
      select: {
        id: true,
        title: true,
        state: true,
        endedAt: true,
      },
    });
    if (!meeting) {
      throw new Error("회의록을 찾을 수 없습니다.");
    }
    const access = await prisma.teamMeetingAccess.findUnique({
      where: {
        meetingId_userId: {
          meetingId: meeting.id,
          userId: params.authorId,
        },
      },
    });
    const isHost =
      (await prisma.teamMeeting.findFirst({
        where: {
          id: meeting.id,
          OR: [
            { organizerId: params.authorId },
            { createdById: params.authorId },
          ],
        },
        select: { id: true },
      })) != null;
    if (!access?.canReadMasked && !isHost) {
      throw new Error("이 회의록을 공유할 권한이 없습니다.");
    }
    attachmentType = "team_meeting";
    teamMeetingId = meeting.id;
    attachmentMeta = {
      title: meeting.title,
      state: meeting.state,
      endedAt: meeting.endedAt?.toISOString() ?? null,
    };
  }

  if (!text && !attachmentType) {
    throw new Error("메시지 내용 또는 Faith 첨부(파일·회의록)가 필요합니다.");
  }

  let sealedBody: string;
  try {
    sealedBody = await sealTeamText(params.teamId, "content", text);
  } catch {
    throw new Error("팀 보안 키가 준비되지 않아 메시지를 저장할 수 없습니다.");
  }

  const row = await prisma.teamChatMessage.create({
    data: {
      id: `tcm-${randomUUID().slice(0, 12)}`,
      teamId: params.teamId,
      channel,
      authorId: params.authorId,
      body: sealedBody,
      attachmentType,
      vaultFileId,
      teamMeetingId,
      attachmentMeta: attachmentMeta ?? undefined,
    },
    include: messageInclude,
  });

  const message = await toPublicTeamChatMessage(row);
  publishTeamChatEvent({
    type: "message",
    teamId: params.teamId,
    channel,
    messageId: message.id,
    createdAt: message.createdAt,
  });
  return message;
}
