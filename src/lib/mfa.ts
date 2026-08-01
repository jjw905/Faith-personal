import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";

import { openSealedJson, sealJson } from "@/lib/crypto/sealed-json";
import { prisma } from "@/lib/prisma";

const MFA_PERIOD_SECONDS = 30;
const MFA_DIGITS = 6;
const MFA_RECOVERY_CODE_COUNT = 10;

type SealedMfaSecret = { secret: string };

export type MfaSetup = {
  secret: string;
  otpauthUri: string;
};

export type MfaStatus = {
  enabled: boolean;
  hasPassword: boolean;
  recoveryCodeCount: number;
};

function mfaIssuer() {
  return process.env.MFA_ISSUER?.trim() || "Faith";
}

function requireAuthSecret() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_SECRET가 필요합니다.");
  }
  return secret;
}

function normalizeTotpCode(value: string) {
  return value.trim().replace(/\s+/g, "");
}

function normalizeRecoveryCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hashRecoveryCode(code: string) {
  return createHmac("sha256", requireAuthSecret())
    .update(`faith:mfa-recovery:v1:${normalizeRecoveryCode(code)}`)
    .digest("hex");
}

function generateRecoveryCode() {
  const raw = randomBytes(8).toString("hex").toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
}

function openSecret(encrypted: string | null) {
  if (!encrypted) return null;
  const value = openSealedJson<SealedMfaSecret>(encrypted);
  return value?.secret?.trim() || null;
}

async function verifyTotpSecret(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return null;
  const result = await verify({
    secret,
    token: code,
    epochTolerance: MFA_PERIOD_SECONDS,
  });
  if (!result.valid) return null;

  const delta = typeof result.delta === "number" ? result.delta : 0;
  return Math.floor(Date.now() / 1000 / MFA_PERIOD_SECONDS) + delta;
}

async function consumeTotpStep(userId: string, step: number) {
  const result = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }],
    },
    data: { mfaLastUsedStep: step },
  });
  return result.count === 1;
}

async function verifyUserCode(
  user: {
    id: string;
    mfaEnabled: boolean;
    mfaSecretEncrypted: string | null;
  },
  code: string,
) {
  if (!user.mfaEnabled) return false;

  const normalizedTotp = normalizeTotpCode(code);
  const secret = openSecret(user.mfaSecretEncrypted);
  if (secret) {
    const step = await verifyTotpSecret(secret, normalizedTotp);
    if (step !== null && (await consumeTotpStep(user.id, step))) {
      return true;
    }
  }

  const recoveryHash = hashRecoveryCode(code);
  const consumed = await prisma.mfaRecoveryCode.updateMany({
    where: {
      userId: user.id,
      codeHash: recoveryHash,
      usedAt: null,
    },
    data: { usedAt: new Date() },
  });
  return consumed.count === 1;
}

export async function getMfaStatus(userId: string): Promise<MfaStatus> {
  const [user, recoveryCodeCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, passwordHash: true },
    }),
    prisma.mfaRecoveryCode.count({
      where: { userId, usedAt: null },
    }),
  ]);
  return {
    enabled: Boolean(user?.mfaEnabled),
    hasPassword: Boolean(user?.passwordHash),
    recoveryCodeCount,
  };
}

export async function startMfaSetup(
  userId: string,
  accountLabel: string,
): Promise<MfaSetup> {
  requireAuthSecret();
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { mfaEnabled: true, passwordHash: true },
  });
  if (!current) throw new Error("사용자를 찾을 수 없습니다.");
  if (!current.passwordHash) {
    throw new Error(
      "MFA를 켜기 전에 계정 설정에서 이메일 로그인 비밀번호를 먼저 만들어 주세요.",
    );
  }
  if (current.mfaEnabled) {
    throw new Error("MFA가 이미 켜져 있습니다.");
  }

  const secret = generateSecret({ length: 20 });
  const encrypted = sealJson({ secret } satisfies SealedMfaSecret);
  await prisma.user.update({
    where: { id: userId },
    data: {
      mfaPendingSecretEncrypted: encrypted,
      mfaPendingCreatedAt: new Date(),
    },
  });

  return {
    secret,
    otpauthUri: generateURI({
      issuer: mfaIssuer(),
      label: accountLabel,
      secret,
      algorithm: "sha1",
      digits: MFA_DIGITS,
      period: MFA_PERIOD_SECONDS,
    }),
  };
}

export async function confirmMfaSetup(userId: string, code: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      mfaPendingSecretEncrypted: true,
      mfaPendingCreatedAt: true,
    },
  });
  const pendingSecret = openSecret(user?.mfaPendingSecretEncrypted ?? null);
  if (
    !pendingSecret ||
    !user?.mfaPendingCreatedAt ||
    Date.now() - user.mfaPendingCreatedAt.getTime() > 10 * 60 * 1000
  ) {
    throw new Error("MFA 설정 시간이 만료되었습니다. 다시 시작해 주세요.");
  }

  const step = await verifyTotpSecret(pendingSecret, normalizeTotpCode(code));
  if (step === null) {
    throw new Error("인증 앱의 6자리 코드가 올바르지 않습니다.");
  }

  const recoveryCodes = Array.from(
    { length: MFA_RECOVERY_CODE_COUNT },
    generateRecoveryCode,
  );
  await prisma.$transaction(async (tx) => {
    await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaVersion: { increment: 1 },
        mfaSecretEncrypted: sealJson({ secret: pendingSecret }),
        mfaPendingSecretEncrypted: null,
        mfaPendingCreatedAt: null,
        mfaLastUsedStep: step,
      },
    });
    await tx.mfaRecoveryCode.createMany({
      data: recoveryCodes.map((recoveryCode) => ({
        userId,
        codeHash: hashRecoveryCode(recoveryCode),
      })),
    });
  });

  return recoveryCodes;
}

export async function disableMfa(userId: string, code: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      mfaEnabled: true,
      mfaSecretEncrypted: true,
    },
  });
  if (!user?.mfaEnabled) return;
  if (!(await verifyUserCode(user, code))) {
    throw new Error("인증 앱 코드 또는 복구 코드가 올바르지 않습니다.");
  }

  await prisma.$transaction([
    prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
    prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaVersion: { increment: 1 },
        mfaSecretEncrypted: null,
        mfaPendingSecretEncrypted: null,
        mfaPendingCreatedAt: null,
        mfaLastUsedStep: null,
      },
    }),
  ]);
}

/**
 * Credentials 로그인과 MFA 설정 해제에서 공통으로 사용하는 검증 함수.
 * 성공 시 TOTP는 재사용을 막고, 복구 코드는 즉시 소모한다.
 */
export async function verifyMfaCodeForUser(userId: string, code: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      mfaEnabled: true,
      mfaSecretEncrypted: true,
    },
  });
  return user ? verifyUserCode(user, code) : false;
}
