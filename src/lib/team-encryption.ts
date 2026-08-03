import "server-only";

import type { Prisma } from "@prisma/client";

import { evaluateKmsProvisioningRuntime } from "@/lib/kms-runtime-policy";
import {
  decryptTeamChunkWithDataKey,
  decryptTeamChunkedRangeWithDataKey,
  decryptTeamBufferWithDataKey,
  encryptTeamChunkedBufferWithDataKey,
  encryptTeamBufferWithDataKey,
  isTeamChunkedEncryptedEnvelope,
  isTeamEncryptedEnvelope,
  type TeamChunkedEncryptedEnvelope,
  type TeamEncryptedEnvelope,
  type TeamKeyPurpose,
} from "@/lib/team-encryption-core";
import {
  getTeamDataKey,
} from "@/lib/team-kms";

export {
  decryptTeamChunkWithDataKey,
  decryptTeamChunkedRangeWithDataKey,
  decryptTeamBufferWithDataKey,
  encryptTeamChunkedBufferWithDataKey,
  encryptTeamBufferWithDataKey,
  isTeamChunkedEncryptedEnvelope,
  isTeamEncryptedEnvelope,
} from "@/lib/team-encryption-core";
export type {
  TeamChunkedEncryptedEnvelope,
  TeamEncryptedEnvelope,
  TeamKeyPurpose,
} from "@/lib/team-encryption-core";

/**
 * KMS is enabled only for a production runtime with complete configuration.
 * A production process that explicitly enables KMS but misses a required value
 * is treated as an encryption failure rather than silently writing plaintext.
 */
export function teamEncryptionRequired() {
  const decision = evaluateKmsProvisioningRuntime();
  return decision.allowed || decision.reason === "missing_configuration";
}

export async function encryptTeamBuffer(params: {
  teamId: string;
  purpose: TeamKeyPurpose;
  plaintext: Buffer;
}) {
  if (!teamEncryptionRequired()) {
    return {
      encrypted: false as const,
      body: Buffer.from(params.plaintext),
      envelope: null,
    };
  }

  const dataKey = await getTeamDataKey(params.teamId, params.purpose);
  return encryptTeamBufferWithDataKey({
    ...params,
    dataKey,
  });
}

/** 신규 대용량 팀 파일은 청크별 인증 태그를 사용해 Range 복호화를 지원한다. */
export async function encryptTeamChunkedBuffer(params: {
  teamId: string;
  purpose: TeamKeyPurpose;
  plaintext: Buffer;
}) {
  if (!teamEncryptionRequired()) {
    return {
      encrypted: false as const,
      body: Buffer.from(params.plaintext),
      envelope: null,
    };
  }
  const dataKey = await getTeamDataKey(params.teamId, params.purpose);
  return encryptTeamChunkedBufferWithDataKey({ ...params, dataKey });
}

export async function decryptTeamBuffer(params: {
  teamId: string;
  purpose: TeamKeyPurpose;
  body: Buffer;
  envelope: TeamEncryptedEnvelope;
}) {
  if (
    !isTeamEncryptedEnvelope(params.envelope) ||
    params.envelope.purpose !== params.purpose
  ) {
    throw new Error("팀 암호화 envelope이 올바르지 않습니다.");
  }

  const dataKey = await getTeamDataKey(params.teamId, params.purpose);
  return decryptTeamBufferWithDataKey({
    ...params,
    dataKey,
  });
}

export async function decryptTeamChunkedRange(params: {
  teamId: string;
  purpose: TeamKeyPurpose;
  body: Buffer;
  ciphertextStart: number;
  start: number;
  end: number;
  envelope: TeamChunkedEncryptedEnvelope;
}) {
  if (
    !isTeamChunkedEncryptedEnvelope(params.envelope) ||
    params.envelope.purpose !== params.purpose
  ) {
    throw new Error("팀 청크 암호화 envelope이 올바르지 않습니다.");
  }
  const dataKey = await getTeamDataKey(params.teamId, params.purpose);
  return decryptTeamChunkedRangeWithDataKey({
    ...params,
    dataKey,
    ciphertext: params.body,
  });
}

export async function createTeamChunkDecryptor(params: {
  teamId: string;
  purpose: TeamKeyPurpose;
  envelope: TeamChunkedEncryptedEnvelope;
}) {
  if (
    !isTeamChunkedEncryptedEnvelope(params.envelope) ||
    params.envelope.purpose !== params.purpose
  ) {
    throw new Error("팀 청크 암호화 envelope이 올바르지 않습니다.");
  }
  const dataKey = await getTeamDataKey(params.teamId, params.purpose);
  return (chunkIndex: number, ciphertext: Buffer) =>
    decryptTeamChunkWithDataKey({
      ...params,
      dataKey,
      chunkIndex,
      ciphertext,
    });
}

export async function sealTeamJson(
  teamId: string,
  purpose: TeamKeyPurpose,
  value: Prisma.JsonValue,
): Promise<Prisma.JsonValue> {
  if (!teamEncryptionRequired()) return value;
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = await encryptTeamBuffer({
    teamId,
    purpose,
    plaintext,
  });
  if (!encrypted.envelope) {
    throw new Error("팀 JSON 암호화 envelope을 만들지 못했습니다.");
  }
  return {
    ...encrypted.envelope,
    ciphertext: encrypted.body.toString("base64url"),
  } satisfies Prisma.InputJsonValue;
}

export async function openTeamJson<T>(
  teamId: string,
  purpose: TeamKeyPurpose,
  value: Prisma.JsonValue | null | undefined,
): Promise<T | null> {
  if (value == null) return null;
  if (!isTeamEncryptedEnvelope(value)) return value as T;
  if (value.purpose !== purpose || !value.ciphertext) {
    throw new Error("팀 JSON 암호화 envelope이 올바르지 않습니다.");
  }
  const plaintext = await decryptTeamBuffer({
    teamId,
    purpose,
    body: Buffer.from(value.ciphertext, "base64url"),
    envelope: value,
  });
  return JSON.parse(plaintext.toString("utf8")) as T;
}

export async function sealTeamText(
  teamId: string,
  purpose: TeamKeyPurpose,
  value: string,
) {
  if (!teamEncryptionRequired()) return value;
  const sealed = await sealTeamJson(teamId, purpose, value);
  return JSON.stringify(sealed);
}

export async function openTeamText(
  teamId: string,
  purpose: TeamKeyPurpose,
  value: string | null | undefined,
) {
  if (value == null || !isTeamEncryptedEnvelope(parseEnvelope(value))) {
    return value ?? "";
  }
  const parsed = parseEnvelope(value);
  const opened = await openTeamJson<string>(teamId, purpose, parsed);
  if (typeof opened !== "string") {
    throw new Error("팀 텍스트 암호화 값이 문자열이 아닙니다.");
  }
  return opened;
}

function parseEnvelope(value: string): TeamEncryptedEnvelope | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isTeamEncryptedEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
