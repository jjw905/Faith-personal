import { NextResponse } from "next/server";

/** 인메모리 IP 레이트 리밋 (단일 인스턴스용. Valkey 연동은 후속). */

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

export function rateLimitResponse(retryAfterSec: number) {
  return NextResponse.json(
    {
      ok: false,
      message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
    },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSec) },
    },
  );
}

/** Auth API 공통 한도 */
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
