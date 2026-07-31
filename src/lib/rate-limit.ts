import { createHash } from "crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

/** 인메모리 + DB(verification_tokens) 레이트 리밋. 재시작·다중 인스턴스 공유. */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const MAX_ENTRIES = 5000;

function prune(now: number) {
  if (buckets.size < MAX_ENTRIES) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size >= MAX_ENTRIES) {
    const first = buckets.keys().next().value;
    if (first) buckets.delete(first);
  }
}

export function clientIpFromHeaders(headers: Headers): string {
  const trustProxy =
    process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true";

  // 프록시 헤더는 배포 환경이 명시적으로 TRUST_PROXY를 켠 경우만 신뢰한다.
  // production이라는 이유만으로 신뢰하면 직접 오리진 요청이 CF 헤더를 위조할 수 있다.
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf && trustProxy) {
    return cf;
  }

  if (trustProxy) {
    const trueClient = headers.get("true-client-ip")?.trim();
    if (trueClient) return trueClient;
    const real = headers.get("x-real-ip")?.trim();
    if (real) return real;
    const xf = headers.get("x-forwarded-for");
    if (xf) {
      const first = xf.split(",")[0]?.trim();
      if (first) return first;
    }
  }

  return "unknown";
}

export function clientIp(request: Request): string {
  return clientIpFromHeaders(request.headers);
}

/** 이메일을 레이트 리밋 키에 넣을 때 해시 (로그/키 노출 완화). */
export function hashRateLimitEmail(email: string) {
  return createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

export function rateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  prune(now);
  const existing = buckets.get(params.key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(params.key, { count: 1, resetAt: now + params.windowMs });
    return { ok: true };
  }
  if (existing.count >= params.limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { ok: true };
}

function peekBucket(
  key: string,
  now = Date.now(),
): Bucket | null {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) return null;
  return existing;
}

export function peekRateLimitCount(key: string): number {
  return peekBucket(key)?.count ?? 0;
}

function unconsumeRateLimit(key: string) {
  const existing = buckets.get(key);
  if (!existing) return;
  existing.count = Math.max(0, existing.count - 1);
  if (existing.count <= 0) buckets.delete(key);
}

/** 성공한 인증 뒤 해당 실패/시도 버킷을 비운다. */
export function resetRateLimit(...keys: string[]) {
  for (const key of keys) buckets.delete(key);
}

/** 연속 실패 카운트 (CAPTCHA 트리거). */
export function noteAuthFailure(key: string, windowMs = 15 * 60_000) {
  const now = Date.now();
  prune(now);
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

export function authFailureCount(key: string): number {
  return peekRateLimitCount(key);
}

export function clearAuthFailures(...keys: string[]) {
  resetRateLimit(...keys);
}

export function rateLimitResponse(_retryAfterSec: number) {
  // OWASP Bot Cheat Sheet: 정밀 Retry-After·어느 버킷인지 노출 금지.
  // 클라이언트는 고정 쿨다운(예: 60초)으로 UX만 맞춤.
  return NextResponse.json(
    {
      ok: false,
      message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      code: "rate_limited",
    },
    { status: 429 },
  );
}

function rlIdentifier(key: string) {
  return `ratelimit:${key}`;
}

/** DB 공유 한도 (메일·OTP 시도 등). 실패 시 인메모리로 폴백. */
export async function durableRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
  const now = Date.now();
  const identifier = rlIdentifier(params.key);
  try {
    const row = await prisma.verificationToken.findFirst({
      where: { identifier },
      orderBy: { expires: "desc" },
    });
    if (!row || row.expires.getTime() <= now) {
      await prisma.verificationToken.deleteMany({ where: { identifier } });
      await prisma.verificationToken.create({
        data: {
          identifier,
          token: `${identifier}:${now}:1`,
          expires: new Date(now + params.windowMs),
        },
      });
      rateLimit(params); // L1 동기화
      return { ok: true };
    }
    const countPart = row.token.split(":").pop();
    const count = Number(countPart);
    const safeCount = Number.isFinite(count) ? count : 0;
    if (safeCount >= params.limit) {
      return {
        ok: false,
        retryAfterSec: Math.max(
          1,
          Math.ceil((row.expires.getTime() - now) / 1000),
        ),
      };
    }
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    await prisma.verificationToken.create({
      data: {
        identifier,
        token: `${identifier}:${now}:${safeCount + 1}`,
        expires: row.expires,
      },
    });
    return { ok: true };
  } catch (err) {
    console.error(
      "[rate-limit] durable fallback",
      err instanceof Error ? err.message.slice(0, 200) : err,
    );
    return rateLimit(params);
  }
}

export async function durableResetRateLimit(...keys: string[]) {
  resetRateLimit(...keys);
  try {
    await prisma.verificationToken.deleteMany({
      where: { identifier: { in: keys.map(rlIdentifier) } },
    });
  } catch {
    // ignore
  }
}

async function durableUnconsume(key: string) {
  unconsumeRateLimit(key);
  const identifier = rlIdentifier(key);
  const now = Date.now();
  try {
    const row = await prisma.verificationToken.findFirst({
      where: { identifier },
    });
    if (!row || row.expires.getTime() <= now) {
      await prisma.verificationToken.deleteMany({ where: { identifier } });
      return;
    }
    const countPart = row.token.split(":").pop();
    const count = Number(countPart);
    const safeCount = Number.isFinite(count) ? count : 0;
    const next = Math.max(0, safeCount - 1);
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    if (next <= 0) return;
    await prisma.verificationToken.create({
      data: {
        identifier,
        token: `${identifier}:${now}:${next}`,
        expires: row.expires,
      },
    });
  } catch {
    // ignore
  }
}

async function durablePeekLimited(
  key: string,
  limit: number,
): Promise<{ limited: true; retryAfterSec: number } | { limited: false }> {
  const mem = peekBucket(key);
  if (mem && mem.count >= limit) {
    return {
      limited: true,
      retryAfterSec: Math.max(1, Math.ceil((mem.resetAt - Date.now()) / 1000)),
    };
  }
  try {
    const row = await prisma.verificationToken.findFirst({
      where: { identifier: rlIdentifier(key) },
    });
    const now = Date.now();
    if (!row || row.expires.getTime() <= now) return { limited: false };
    const countPart = row.token.split(":").pop();
    const count = Number(countPart);
    const safeCount = Number.isFinite(count) ? count : 0;
    if (safeCount >= limit) {
      return {
        limited: true,
        retryAfterSec: Math.max(
          1,
          Math.ceil((row.expires.getTime() - now) / 1000),
        ),
      };
    }
  } catch {
    // ignore
  }
  return { limited: false };
}

export type MailSendGate =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      commitCooldown: () => Promise<void>;
      rollback: () => Promise<void>;
    };

/** 메일 발송: 진입 한도 소비, 쿨다운은 발송 성공 후에만. 실패 시 rollback. */
export async function beginMailSendLimits(
  request: Request,
  scope: string,
  email: string,
  opts?: {
    cooldownMs?: number;
    ipPerMinute?: number;
    emailPerWindow?: number;
    emailWindowMs?: number;
    emailPerDay?: number;
    ipPerHour?: number;
    ipPerWindow?: number;
    ipWindowMs?: number;
  },
): Promise<MailSendGate> {
  const cooldownMs = opts?.cooldownMs ?? 60_000;
  const ipPerMinute = opts?.ipPerMinute ?? 3;
  const emailPerWindow = opts?.emailPerWindow ?? 3;
  const emailWindowMs = opts?.emailWindowMs ?? 15 * 60_000;
  const emailPerDay = opts?.emailPerDay ?? 8;
  const ipPerHour = opts?.ipPerHour ?? 12;
  const ipPerWindow = opts?.ipPerWindow ?? 6;
  const ipWindowMs = opts?.ipWindowMs ?? 15 * 60_000;

  const emailKey = hashRateLimitEmail(email);
  const ip = clientIp(request);
  const consumed: { key: string; windowMs: number }[] = [];

  const cooldownKey = `${scope}:cooldown:${emailKey}`;
  const coolPeek = await durablePeekLimited(cooldownKey, 1);
  if (coolPeek.limited) {
    return { ok: false, response: rateLimitResponse(coolPeek.retryAfterSec) };
  }

  const checks: { key: string; limit: number; windowMs: number }[] = [
    { key: `${scope}:ip:${ip}`, limit: ipPerMinute, windowMs: 60_000 },
    {
      key: `${scope}:email:${emailKey}`,
      limit: emailPerWindow,
      windowMs: emailWindowMs,
    },
    {
      key: `${scope}:day:${emailKey}`,
      limit: emailPerDay,
      windowMs: 24 * 60 * 60_000,
    },
    {
      key: `${scope}:hour-ip:${ip}`,
      limit: ipPerHour,
      windowMs: 60 * 60_000,
    },
    {
      key: `${scope}:ip-window:${ip}`,
      limit: ipPerWindow,
      windowMs: ipWindowMs,
    },
  ];

  for (const c of checks) {
    const result = await durableRateLimit(c);
    if (!result.ok) {
      await Promise.all(consumed.map((x) => durableUnconsume(x.key)));
      return { ok: false, response: rateLimitResponse(result.retryAfterSec) };
    }
    consumed.push({ key: c.key, windowMs: c.windowMs });
  }

  return {
    ok: true,
    commitCooldown: async () => {
      await durableRateLimit({
        key: cooldownKey,
        limit: 1,
        windowMs: cooldownMs,
      });
    },
    rollback: async () => {
      await Promise.all(consumed.map((x) => durableUnconsume(x.key)));
    },
  };
}

/** Auth API 공통 한도 (IP만). */
export function enforceAuthRateLimit(
  request: Request,
  scope: string,
  limit = 20,
  windowMs = 60_000,
) {
  const ip = clientIp(request);
  const result = rateLimit({ key: `${scope}:${ip}`, limit, windowMs });
  if (!result.ok) return rateLimitResponse(result.retryAfterSec);
  return null;
}

/** IP + 이메일(해시) 이중 한도. */
export function enforceAuthDualRateLimit(
  request: Request,
  scope: string,
  opts: {
    ipLimit: number;
    ipWindowMs: number;
    email?: string;
    emailLimit: number;
    emailWindowMs: number;
  },
) {
  const ip = clientIp(request);
  const ipResult = rateLimit({
    key: `${scope}:ip:${ip}`,
    limit: opts.ipLimit,
    windowMs: opts.ipWindowMs,
  });
  if (!ipResult.ok) return rateLimitResponse(ipResult.retryAfterSec);

  if (opts.email?.trim()) {
    const emailKey = hashRateLimitEmail(opts.email);
    const emailResult = rateLimit({
      key: `${scope}:email:${emailKey}`,
      limit: opts.emailLimit,
      windowMs: opts.emailWindowMs,
    });
    if (!emailResult.ok) return rateLimitResponse(emailResult.retryAfterSec);
  }
  return null;
}
