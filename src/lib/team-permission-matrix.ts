import type { TeamRole } from "@prisma/client";

export const TEAM_INVITE_TTL_MS = 60 * 60_000;

export function isTeamInviteExpired(expiresAt: Date, now = new Date()) {
  return expiresAt.getTime() <= now.getTime();
}

export type TeamCapability =
  | "manageTeam"
  | "invite"
  | "createMeeting"
  | "manageRecordAccess"
  | "viewAudit";

export type TeamPermissionSubject = {
  role: TeamRole;
  canInvite: boolean;
  canCreateMeeting: boolean;
  canManageRecordAccess: boolean;
};

export function isTeamManager(role: TeamRole) {
  return role === "OWNER" || role === "ADMIN";
}

export function hasTeamCapability(
  member: TeamPermissionSubject,
  capability: TeamCapability,
) {
  if (member.role === "OWNER") return true;
  if (capability === "viewAudit") return false;
  if (capability === "manageTeam") return member.role === "ADMIN";
  if (member.role === "ADMIN") return true;
  if (capability === "invite") return member.canInvite;
  if (capability === "createMeeting") return member.canCreateMeeting;
  return member.canManageRecordAccess;
}

