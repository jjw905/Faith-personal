import { createHash, randomInt } from "crypto";

import { prisma } from "@/lib/prisma";

const OTP_TTL_MS = 1000 * 60 * 10;

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
