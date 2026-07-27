import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { clientIp } from "@/lib/rate-limit";

export type AdminAuditAction =
  | "user.plan"
  | "user.role"
  | "user.disabled"
  | "user.team_entitlement";

/** 조회 기간. day=오늘, week=최근7일, month=최근30일, year=올해, all=전체 */
export type AdminAuditPeriod = "day" | "week" | "month" | "year" | "all";

export const ADMIN_AUDIT_ACTIONS: {
  id: AdminAuditAction;
  label: string;
}[] = [
  { id: "user.plan", label: "등급" },
  { id: "user.role", label: "역할" },
  { id: "user.disabled", label: "상태" },
  { id: "user.team_entitlement", label: "팀권한" },
];

/** Append-only. 앱에서 delete/purge 하지 않음. */
export async function writeAdminAudit(params: {
  actorId?: string | null;
  targetUserId?: string | null;
  action: AdminAuditAction | string;
  metadata?: Record<string, unknown>;
  request?: Request;
  db?: Prisma.TransactionClient | typeof prisma;
}) {
  const db = params.db ?? prisma;
  return db.adminAuditLog.create({
    data: {
      id: randomUUID(),
      actorId: params.actorId ?? null,
      targetUserId: params.targetUserId ?? null,
      action: params.action,
      metadata: params.metadata as Prisma.InputJsonValue | undefined,
      ip: params.request ? clientIp(params.request) : null,
      userAgent:
        params.request?.headers.get("user-agent")?.slice(0, 500) ?? null,
    },
  });
}

function seoulYmd(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return {
    y: Number(parts.find((p) => p.type === "year")?.value),
    m: Number(parts.find((p) => p.type === "month")?.value),
    d: Number(parts.find((p) => p.type === "day")?.value),
  };
}

/** YYYY-MM-DD(서울 달력) → 해당일 00:00 KST */
function seoulDayStart(ymd: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0) - 9 * 60 * 60 * 1000);
}

/** YYYY-MM-DD(서울 달력) → 다음날 00:00 KST (exclusive end) */
function seoulDayEndExclusive(ymd: string): Date | null {
  const start = seoulDayStart(ymd);
  if (!start) return null;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** Asia/Seoul 기준 기간 시작. all이면 null. */
function periodStart(period: AdminAuditPeriod, now = new Date()): Date | null {
  if (period === "all") return null;
  const { y, m, d } = seoulYmd(now);
  const todayStart = new Date(
    Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 9 * 60 * 60 * 1000,
  );

  if (period === "day") return todayStart;
  if (period === "week") {
    return new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
  }
  if (period === "month") {
    return new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
  }
  return new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0) - 9 * 60 * 60 * 1000);
}

function isAuditAction(value: string): value is AdminAuditAction {
  return ADMIN_AUDIT_ACTIONS.some((a) => a.id === value);
}

export async function listAdminAuditPage(params?: {
  page?: number;
  pageSize?: number;
  q?: string;
  period?: AdminAuditPeriod;
  /** YYYY-MM-DD, 있으면 period보다 우선 */
  from?: string | null;
  /** YYYY-MM-DD, 있으면 period보다 우선 */
  to?: string | null;
  action?: string;
}) {
  const pageSize = Math.min(50, Math.max(1, Math.floor(params?.pageSize ?? 20)));
  const page = Math.max(1, Math.floor(params?.page ?? 1));
  const skip = (page - 1) * pageSize;
  const q = params?.q?.trim() ?? "";
  const period = params?.period ?? "week";
  const action =
    params?.action && isAuditAction(params.action) ? params.action : undefined;

  const fromStart = params?.from ? seoulDayStart(params.from) : null;
  const toEnd = params?.to ? seoulDayEndExclusive(params.to) : null;
  const hasRange = Boolean(fromStart || toEnd);
  const since = hasRange ? fromStart : periodStart(period);

  const createdAt: Prisma.DateTimeFilter = {};
  if (since) createdAt.gte = since;
  if (toEnd) createdAt.lt = toEnd;

  const where: Prisma.AdminAuditLogWhereInput = {
    ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    ...(action ? { action } : {}),
    ...(q
      ? {
          OR: [
            { actor: { name: { contains: q, mode: "insensitive" } } },
            { actor: { email: { contains: q, mode: "insensitive" } } },
            { actor: { handle: { contains: q, mode: "insensitive" } } },
            { targetUser: { name: { contains: q, mode: "insensitive" } } },
            { targetUser: { email: { contains: q, mode: "insensitive" } } },
            { targetUser: { handle: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [total, logs] = await Promise.all([
    prisma.adminAuditLog.count({ where }),
    prisma.adminAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        action: true,
        metadata: true,
        ip: true,
        createdAt: true,
        actor: {
          select: { id: true, name: true, email: true, handle: true },
        },
        targetUser: {
          select: { id: true, name: true, email: true, handle: true },
        },
      },
    }),
  ]);

  return {
    total,
    page,
    pageSize,
    logs,
    period,
    action: action ?? null,
    from: params?.from ?? null,
    to: params?.to ?? null,
  };
}
