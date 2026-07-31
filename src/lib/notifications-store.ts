import "server-only";

import type { Prisma } from "@prisma/client";

import {
  DEFAULT_DATA_RETENTION_DAYS,
  NOTIFICATION_RECENT_DISPLAY_DAYS,
  parseDataRetentionDays,
  type DataRetentionDays,
} from "@/lib/data-retention";
import { isTeamFeatureEnabledForRole } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import type { AppNotification, NotificationType } from "@/types/notification";

function relativeTime(iso: string, now = new Date()) {
  const deltaMinutes = Math.max(
    0,
    Math.round((now.getTime() - new Date(iso).getTime()) / 60_000),
  );
  if (deltaMinutes < 1) return "방금";
  if (deltaMinutes < 60) return `${deltaMinutes}분 전`;
  const hours = Math.round(deltaMinutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });
}

function toAppNotification(row: {
  id: string;
  type: string;
  kind: string | null;
  title: string;
  body: string;
  data: Prisma.JsonValue | null;
  teamId: string | null;
  meetingId: string | null;
  visibleInWorkspace: boolean;
  createdAt: Date;
  readAt: Date | null;
  confirmedAt: Date | null;
  dismissedAt: Date | null;
}): AppNotification {
  const data =
    row.data && typeof row.data === "object" && !Array.isArray(row.data)
      ? { ...(row.data as Record<string, unknown>) }
      : {};
  if (row.kind) data.kind = row.kind;
  if (row.teamId) data.teamId = row.teamId;
  if (row.meetingId) data.meetingId = row.meetingId;
  data.visibleInWorkspace = row.visibleInWorkspace;
  data.confirmed = Boolean(row.confirmedAt);
  return {
    id: row.id,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    data,
    time: relativeTime(row.createdAt.toISOString()),
    unread: !row.readAt && !row.confirmedAt && !row.dismissedAt,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  kind?: string;
  teamId?: string | null;
  meetingId?: string | null;
  groupKey?: string | null;
  visibleInWorkspace?: boolean;
}) {
  return prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      kind: params.kind,
      title: params.title,
      body: params.body,
      data: params.data as Prisma.InputJsonValue | undefined,
      teamId: params.teamId,
      meetingId: params.meetingId,
      groupKey: params.groupKey,
      visibleInWorkspace: params.visibleInWorkspace ?? false,
    },
  });
}

export async function listVisibleNotifications(
  userId: string,
  requestedRetention?: DataRetentionDays,
  options?: { purge?: boolean },
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { notificationRetentionDays: true, role: true },
  });
  const canUseTeamFeature = isTeamFeatureEnabledForRole(user?.role);
  const retentionDays = parseDataRetentionDays(
    requestedRetention ??
      user?.notificationRetentionDays ??
      DEFAULT_DATA_RETENTION_DAYS,
  );
  const now = new Date();
  const retentionCutoff = new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
  );
  const recentCutoff = new Date(
    now.getTime() - NOTIFICATION_RECENT_DISPLAY_DAYS * 24 * 60 * 60 * 1000,
  );
  // 배지 countOnly 폴링마다 삭제하면 불필요하게 무겁다. 목록 열 때만 purge.
  if (options?.purge !== false) {
    await prisma.notification.deleteMany({
      where: { userId, createdAt: { lt: retentionCutoff } },
    });
  }
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      dismissedAt: null,
      createdAt: { gte: retentionCutoff },
      OR: [
        { confirmedAt: null, readAt: null },
        { readAt: { gte: recentCutoff } },
        { confirmedAt: { gte: recentCutoff } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const visibleRows = canUseTeamFeature
    ? rows
    : rows.filter((row) => {
        if (row.teamId) return false;
        const data =
          row.data &&
          typeof row.data === "object" &&
          !Array.isArray(row.data)
            ? (row.data as Record<string, unknown>)
            : null;
        return typeof data?.teamId !== "string";
      });
  const items = visibleRows.map(toAppNotification);
  const unread = items.filter((item) => item.unread);
  return {
    unread,
    recent: items.filter((item) => !item.unread),
    unreadCount: unread.length,
    retentionDays,
  };
}

export async function listWorkspaceMeetingAcks(userId: string, teamId: string) {
  return prisma.notification.findMany({
    where: {
      userId,
      teamId,
      kind: "meeting_ack",
      visibleInWorkspace: true,
      confirmedAt: null,
      dismissedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function markNotificationsRead(
  userId: string,
  ids: string[] | "all",
  retentionDays?: DataRetentionDays,
) {
  await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids === "all" ? {} : { id: { in: ids } }),
    },
    data: { readAt: new Date() },
  });
  const result = await listVisibleNotifications(userId, retentionDays);
  return { ok: true as const, unreadCount: result.unreadCount };
}

export async function setUserNotificationRetention(
  userId: string,
  retentionDays: DataRetentionDays,
) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      notificationRetentionDays: retentionDays,
      // 레거시 알림 API로만 바꿀 때도 회의 보존과 어긋나지 않게 같이 맞춘다.
      meetingRetentionDays: retentionDays,
    },
  });
}

export async function resetUserNotifications(userId: string) {
  await prisma.notification.deleteMany({ where: { userId } });
}
