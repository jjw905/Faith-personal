import { createHash, randomBytes, randomInt } from "crypto";

import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

const OTP_TTL_MS = 1000 * 60 * 10;
/** 가입용 이메일 인증 증명. OTP 확인 후 가입 완료까지. */
const SIGNUP_PROOF_TTL_MS = 1000 * 60 * 30;
/** 비밀번호 재설정 링크. OTP와 동일하게 10분. */
const RESET_TOKEN_TTL_MS = 1000 * 60 * 10;
/** identifier당 검증 시도 상한 (무차별 방지). 초과 시 OTP 폐기. */
const OTP_MAX_ATTEMPTS = 5;

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function generateOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function signupOtpIdentifier(email: string) {
  return `signup-otp:${email.trim().toLowerCase()}`;
}

export function signupProofIdentifier(email: string) {
  return `signup-proof:${email.trim().toLowerCase()}`;
}

export function generateSignupProof() {
  return randomBytes(32).toString("hex");
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

/** OTP 통과 후 가입/이메일 등록에 쓰는 일회성 증명. */
export async function storeSignupProof(email: string, rawProof: string) {
  const identifier = signupProofIdentifier(email);
  const token = hashCode(rawProof);
  const expires = new Date(Date.now() + SIGNUP_PROOF_TTL_MS);
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token, expires },
  });
}

export async function consumeSignupProof(email: string, rawProof: string) {
  const identifier = signupProofIdentifier(email);
  const row = await prisma.verificationToken.findFirst({
    where: { identifier, token: hashCode(rawProof) },
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
  const expires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
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
