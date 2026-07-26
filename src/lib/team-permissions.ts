import "server-only";

import { randomBytes, randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";
import {
  hasTeamCapability,
  type TeamCapability,
} from "@/lib/team-permission-matrix";

export { hasTeamCapability, isTeamManager } from "@/lib/team-permission-matrix";

export async function getTeamMember(teamId: string, userId: string) {
  return prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId } },
    include: {
      team: { include: { policy: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          handle: true,
          inviteCode: true,
          disabled: true,
        },
      },
    },
  });
}

export async function requireTeamCapability(
  teamId: string,
  userId: string,
  capability: TeamCapability,
) {
  const member = await getTeamMember(teamId, userId);
  if (!member || member.user.disabled || !hasTeamCapability(member, capability)) {
    return null;
  }
  return member;
}

function normalizeHandleBase(value: string) {
  const ascii = value
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return (ascii || "member").slice(0, 20);
}

export async function ensureUserIdentifiers(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, handle: true, inviteCode: true },
  });
  if (!user) return null;
  if (user.handle && user.inviteCode) return user;

  const base = normalizeHandleBase(user.name || user.email?.split("@")[0] || "member");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const suffix = randomBytes(2).toString("hex");
    const handle = user.handle || `${base}-${suffix}`;
    const inviteCode =
      user.inviteCode ||
      randomBytes(6).toString("base64url").toUpperCase().slice(0, 8);
    try {
      return await prisma.user.update({
        where: { id: userId },
        data: { handle, inviteCode },
        select: {
          id: true,
          name: true,
          email: true,
          handle: true,
          inviteCode: true,
        },
      });
    } catch {
      // Unique collision. Generate a new suffix/code and retry.
    }
  }
  throw new Error("사용자 고유 아이디를 만들지 못했습니다.");
}

export async function writeTeamAudit(params: {
  teamId: string;
  actorId?: string | null;
  targetUserId?: string | null;
  meetingId?: string | null;
  action: string;
  metadata?: Record<string, unknown>;
  request?: Request;
}) {
  return prisma.teamAuditLog.create({
    data: {
      id: randomUUID(),
      teamId: params.teamId,
      actorId: params.actorId,
      targetUserId: params.targetUserId,
      meetingId: params.meetingId,
      action: params.action,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
      ip: params.request ? clientIp(params.request) : null,
      userAgent: params.request?.headers.get("user-agent")?.slice(0, 500) ?? null,
    },
  });
}

