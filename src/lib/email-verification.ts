import { createHmac, timingSafeEqual } from "crypto";

import { prisma } from "@/lib/prisma";

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24;

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET이 필요합니다.");
  return s;
}

export function createVerificationToken(email: string) {
  const normalized = email.trim().toLowerCase();
  const payload = Buffer.from(
    JSON.stringify({ email: normalized, exp: Date.now() + TOKEN_TTL_MS }),
  ).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function parseVerificationToken(token: string): string | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", secret())
    .update(payload)
    .digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { email?: string; exp?: number };
    if (!data.email || typeof data.exp !== "number") return null;
    if (Date.now() > data.exp) return null;
    return data.email.trim().toLowerCase();
  } catch {
    return null;
  }
}

export async function confirmEmailVerification(token: string) {
  const email = parseVerificationToken(token);
  if (!email) return { ok: false as const, email: null };

  const user = await prisma.user.updateMany({
    where: { email },
    data: { emailVerified: new Date() },
  });
  if (user.count === 0) return { ok: false as const, email: null };
  return { ok: true as const, email };
}

export async function isEmailVerifiedInDb(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { emailVerified: true },
  });
  return Boolean(user?.emailVerified);
}
