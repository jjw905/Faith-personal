import { createHash, randomInt } from "crypto";

import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const OTP_TTL_MS = 1000 * 60 * 10;
/** identifier당 검증 시도 상한 (무차별 방지). 초과 시 OTP 폐기. */
const OTP_MAX_ATTEMPTS = 5;

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** identifier 예: email-change:userId:new@email.com */
export async function storeOtp(identifier: string, code: string) {
  const token = hashCode(code);
  const expires = new Date(Date.now() + OTP_TTL_MS);
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token, expires },
  });
}

export async function consumeOtp(identifier: string, code: string) {
  // TTL 내 시도 횟수 제한. 초과하면 현재 OTP 무효화.
  const attempt = rateLimit({
    key: `otp:${identifier}`,
    limit: OTP_MAX_ATTEMPTS,
    windowMs: OTP_TTL_MS,
  });
  if (!attempt.ok) {
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    return false;
  }

  const row = await prisma.verificationToken.findFirst({
    where: { identifier, token: hashCode(code) },
  });
  if (!row || row.expires.getTime() < Date.now()) {
    return false;
  }
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  return true;
}

export async function storeResetToken(email: string, rawToken: string) {
  const identifier = `password-reset:${email}`;
  const token = hashCode(rawToken);
  const expires = new Date(Date.now() + 1000 * 60 * 60);
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token, expires },
  });
}

export async function consumeResetToken(email: string, rawToken: string) {
  const identifier = `password-reset:${email}`;
  const row = await prisma.verificationToken.findFirst({
    where: { identifier, token: hashCode(rawToken) },
  });
  if (!row || row.expires.getTime() < Date.now()) {
    return false;
  }
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  return true;
}
