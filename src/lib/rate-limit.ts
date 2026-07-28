import { createHash } from "crypto";

import { NextResponse } from "next/server";

/** 인메모리 IP/이메일 레이트 리밋 (단일 인스턴스용. Valkey 연동은 후속). */

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

export function clientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return "unknown";
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

export function peekRateLimitCount(key: string): number {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) return 0;
  return existing.count;
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

export function rateLimitResponse(retryAfterSec: number) {
  return NextResponse.json(
    {
      ok: false,
      message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
      code: "rate_limited",
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
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
