import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

import { openSealedJson, sealJson } from "@/lib/crypto/sealed-json";
import {
  DEFAULT_DATA_RETENTION_DAYS,
  isPastDataRetention,
  isWithinRetentionDays,
  NOTIFICATION_RECENT_DISPLAY_DAYS,
  parseDataRetentionDays,
  type DataRetentionDays,
} from "@/lib/data-retention";
import { getNotifications as getCatalogNotifications } from "@/lib/notifications-mock";
import type { AppNotification, NotificationType } from "@/types/notification";

export type StoredNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

type UserNotificationFile = {
  userId: string;
  retentionDays: DataRetentionDays;
  items: StoredNotification[];
  updatedAt: string;
};

const ROOT = join(process.cwd(), ".data", "notifications");

function ensureRoot() {
  if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true });
}

function pathFor(userId: string) {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return join(ROOT, `${safe}.seal`);
}

function catalogSeed(now = new Date()): StoredNotification[] {
  const offsetsMin = [12, 60, 24 * 60];
  return getCatalogNotifications().map((n, i) => {
    const created = new Date(
      now.getTime() - (offsetsMin[i] ?? 60) * 60_000,
    );
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      createdAt: created.toISOString(),
      readAt: null,
    };
  });
}

function loadRaw(userId: string): UserNotificationFile | null {
  const p = pathFor(userId);
  if (!existsSync(p)) return null;
  try {
    const sealed = readFileSync(p, "utf8").trim();
    return openSealedJson<UserNotificationFile>(sealed);
  } catch {
    return null;
  }
}

function saveRaw(file: UserNotificationFile) {
  ensureRoot();
  writeFileSync(pathFor(file.userId), `${sealJson(file)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

function purgeExpired(
  items: StoredNotification[],
  retentionDays: number,
  now = new Date(),
): StoredNotification[] {
  return items.filter((n) => !isPastDataRetention(n.createdAt, retentionDays, now));
}

function ensureUserFile(
  userId: string,
  retentionDays: DataRetentionDays = DEFAULT_DATA_RETENTION_DAYS,
): UserNotificationFile {
  const existing = loadRaw(userId);
  const now = new Date();
  if (!existing) {
    const fresh: UserNotificationFile = {
      userId,
      retentionDays,
      items: purgeExpired(catalogSeed(now), retentionDays, now),
      updatedAt: now.toISOString(),
    };
    saveRaw(fresh);
    return fresh;
  }

  const days = parseDataRetentionDays(
    existing.retentionDays ?? retentionDays,
  );
  const items = purgeExpired(existing.items, days, now);
  const next: UserNotificationFile = {
    ...existing,
    retentionDays: days,
    items,
    updatedAt: now.toISOString(),
  };
  if (items.length !== existing.items.length) saveRaw(next);
  return next;
}

function formatRelativeTime(iso: string, now = new Date()): string {
  const mins = Math.round(daysBetweenMinutes(iso, now));
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days === 1) return "어제";
  if (days < 7) return `${days}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", {
    month: "numeric",
    day: "numeric",
  });
}

function daysBetweenMinutes(iso: string, now: Date) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - t) / 60_000;
}

function toAppNotification(
  n: StoredNotification,
  now = new Date(),
): AppNotification {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    time: formatRelativeTime(n.createdAt, now),
    unread: !n.readAt,
    createdAt: n.createdAt,
    readAt: n.readAt,
  };
}

/** UI에 보일 목록: 안 읽음 전체(보존 내) + 읽음은 최근 7일만. */
export function listVisibleNotifications(
  userId: string,
  retentionDays?: DataRetentionDays,
): {
  unread: AppNotification[];
  recent: AppNotification[];
  unreadCount: number;
  retentionDays: DataRetentionDays;
} {
  const file = ensureUserFile(
    userId,
    retentionDays ?? DEFAULT_DATA_RETENTION_DAYS,
  );
  const now = new Date();
  const days = parseDataRetentionDays(retentionDays ?? file.retentionDays);
  const items = purgeExpired(file.items, days, now);

  if (items.length !== file.items.length || days !== file.retentionDays) {
    saveRaw({
      ...file,
      retentionDays: days,
      items,
      updatedAt: now.toISOString(),
    });
  }

  const unread = items
    .filter((n) => !n.readAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((n) => toAppNotification(n, now));

  const recent = items
    .filter(
      (n) =>
        Boolean(n.readAt) &&
        isWithinRetentionDays(
          n.readAt!,
          NOTIFICATION_RECENT_DISPLAY_DAYS,
          now,
        ),
    )
    .sort((a, b) => (b.readAt || "").localeCompare(a.readAt || ""))
    .map((n) => toAppNotification(n, now));

  return {
    unread,
    recent,
    unreadCount: unread.length,
    retentionDays: days,
  };
}

export function markNotificationsRead(
  userId: string,
  ids: string[] | "all",
  retentionDays?: DataRetentionDays,
): { ok: true; unreadCount: number } {
  const file = ensureUserFile(
    userId,
    retentionDays ?? DEFAULT_DATA_RETENTION_DAYS,
  );
  const now = new Date().toISOString();
  const idSet = ids === "all" ? null : new Set(ids);
  const items = file.items.map((n) => {
    if (n.readAt) return n;
    if (idSet && !idSet.has(n.id)) return n;
    return { ...n, readAt: now };
  });
  saveRaw({
    ...file,
    items,
    updatedAt: now,
  });
  return {
    ok: true,
    unreadCount: listVisibleNotifications(userId, retentionDays).unreadCount,
  };
}

export function setUserNotificationRetention(
  userId: string,
  retentionDays: DataRetentionDays,
) {
  const file = ensureUserFile(userId, retentionDays);
  const now = new Date();
  const items = purgeExpired(file.items, retentionDays, now);
  saveRaw({
    ...file,
    retentionDays,
    items,
    updatedAt: now.toISOString(),
  });
}

/** 테스트용. */
export function resetUserNotifications(userId: string) {
  const p = pathFor(userId);
  if (existsSync(p)) unlinkSync(p);
}
