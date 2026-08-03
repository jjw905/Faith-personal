import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

export type TeamKeyPurpose = "content" | "audit";

const TEAM_ENVELOPE_MARKER = "faith-team-envelope";
const TEAM_ENVELOPE_VERSION = 1 as const;
const TEAM_CHUNKED_ENVELOPE_VERSION = 2 as const;
export const TEAM_ENCRYPTION_CHUNK_BYTES = 1024 * 1024;

export type TeamEncryptedEnvelope = {
  marker: typeof TEAM_ENVELOPE_MARKER;
  version: typeof TEAM_ENVELOPE_VERSION;
  purpose: TeamKeyPurpose;
  dataKeyVersion: 1;
  iv: string;
  tag: string;
  ciphertext?: string;
};

export type TeamChunkedEncryptedEnvelope = {
  marker: typeof TEAM_ENVELOPE_MARKER;
  version: typeof TEAM_CHUNKED_ENVELOPE_VERSION;
  purpose: TeamKeyPurpose;
  dataKeyVersion: 1;
  chunkSize: number;
  plaintextSize: number;
  noncePrefix: string;
  tags: string[];
};

function aadFor(teamId: string, purpose: TeamKeyPurpose) {
  return Buffer.from(
    `faith-team:${TEAM_ENVELOPE_VERSION}:${teamId}:${purpose}`,
    "utf8",
  );
}

function chunkAadFor(params: {
  teamId: string;
  purpose: TeamKeyPurpose;
  chunkIndex: number;
  chunkSize: number;
  plaintextSize: number;
}) {
  return Buffer.from(
    `faith-team:${TEAM_CHUNKED_ENVELOPE_VERSION}:${params.teamId}:${params.purpose}:${params.chunkSize}:${params.plaintextSize}:${params.chunkIndex}`,
    "utf8",
  );
}

function chunkIv(noncePrefix: Buffer, chunkIndex: number) {
  if (noncePrefix.length !== 8) {
    throw new Error("팀 청크 암호화 nonce prefix가 올바르지 않습니다.");
  }
  if (!Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 0xffffffff) {
    throw new Error("팀 청크 암호화 인덱스가 올바르지 않습니다.");
  }
  const iv = Buffer.allocUnsafe(12);
  noncePrefix.copy(iv, 0);
  iv.writeUInt32BE(chunkIndex, 8);
  return iv;
}

export function isTeamEncryptedEnvelope(
  value: unknown,
): value is TeamEncryptedEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Partial<TeamEncryptedEnvelope>;
  return (
    envelope.marker === TEAM_ENVELOPE_MARKER &&
    envelope.version === TEAM_ENVELOPE_VERSION &&
    (envelope.purpose === "content" || envelope.purpose === "audit") &&
    envelope.dataKeyVersion === 1 &&
    typeof envelope.iv === "string" &&
    typeof envelope.tag === "string"
  );
}

export function isTeamChunkedEncryptedEnvelope(
  value: unknown,
): value is TeamChunkedEncryptedEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Partial<TeamChunkedEncryptedEnvelope>;
  if (
    envelope.marker !== TEAM_ENVELOPE_MARKER ||
    envelope.version !== TEAM_CHUNKED_ENVELOPE_VERSION ||
    (envelope.purpose !== "content" && envelope.purpose !== "audit") ||
    envelope.dataKeyVersion !== 1 ||
    !Number.isSafeInteger(envelope.chunkSize) ||
    Number(envelope.chunkSize) <= 0 ||
    !Number.isSafeInteger(envelope.plaintextSize) ||
    Number(envelope.plaintextSize) < 0 ||
    typeof envelope.noncePrefix !== "string" ||
    !Array.isArray(envelope.tags) ||
    !envelope.tags.every((tag) => typeof tag === "string")
  ) {
    return false;
  }
  const expectedChunks = Math.ceil(
    Number(envelope.plaintextSize) / Number(envelope.chunkSize),
  );
  return envelope.tags.length === expectedChunks;
}

function envelopeFor(
  purpose: TeamKeyPurpose,
  iv: Buffer,
  tag: Buffer,
): TeamEncryptedEnvelope {
  return {
    marker: TEAM_ENVELOPE_MARKER,
    version: TEAM_ENVELOPE_VERSION,
    purpose,
    dataKeyVersion: 1,
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
  };
}

export function encryptTeamBufferWithDataKey(params: {
  teamId: string;
  purpose: TeamKeyPurpose;
  dataKey: Buffer;
  plaintext: Buffer;
}) {
  if (params.dataKey.length !== 32) {
    throw new Error("팀 envelope 데이터 키 길이가 올바르지 않습니다.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", params.dataKey, iv);
  cipher.setAAD(aadFor(params.teamId, params.purpose));
  const body = Buffer.concat([cipher.update(params.plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encrypted: true as const,
    body,
    envelope: envelopeFor(params.purpose, iv, tag),
  };
}

export function decryptTeamBufferWithDataKey(params: {
  teamId: string;
  purpose: TeamKeyPurpose;
  dataKey: Buffer;
  body: Buffer;
  envelope: TeamEncryptedEnvelope;
}) {
  if (params.dataKey.length !== 32) {
    throw new Error("팀 envelope 데이터 키 길이가 올바르지 않습니다.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    params.dataKey,
    Buffer.from(params.envelope.iv, "base64url"),
  );
  decipher.setAAD(aadFor(params.teamId, params.purpose));
  decipher.setAuthTag(Buffer.from(params.envelope.tag, "base64url"));
  return Buffer.concat([
    decipher.update(params.body),
    decipher.final(),
  ]);
}

export function encryptTeamChunkedBufferWithDataKey(params: {
  teamId: string;
  purpose: TeamKeyPurpose;
  dataKey: Buffer;
  plaintext: Buffer;
  chunkSize?: number;
}) {
  if (params.dataKey.length !== 32) {
    throw new Error("팀 envelope 데이터 키 길이가 올바르지 않습니다.");
  }
  const chunkSize = Math.max(
    64 * 1024,
    Math.min(8 * 1024 * 1024, Math.floor(params.chunkSize ?? TEAM_ENCRYPTION_CHUNK_BYTES)),
  );
  const noncePrefix = randomBytes(8);
  const encryptedChunks: Buffer[] = [];
  const tags: string[] = [];
  const chunkCount = Math.ceil(params.plaintext.length / chunkSize);

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const start = chunkIndex * chunkSize;
    const plaintextChunk = params.plaintext.subarray(
      start,
      Math.min(params.plaintext.length, start + chunkSize),
    );
    const cipher = createCipheriv(
      "aes-256-gcm",
      params.dataKey,
      chunkIv(noncePrefix, chunkIndex),
    );
    cipher.setAAD(
      chunkAadFor({
        teamId: params.teamId,
        purpose: params.purpose,
        chunkIndex,
        chunkSize,
        plaintextSize: params.plaintext.length,
      }),
    );
    encryptedChunks.push(Buffer.concat([cipher.update(plaintextChunk), cipher.final()]));
    tags.push(cipher.getAuthTag().toString("base64url"));
  }

  return {
    encrypted: true as const,
    body: Buffer.concat(encryptedChunks),
    envelope: {
      marker: TEAM_ENVELOPE_MARKER,
      version: TEAM_CHUNKED_ENVELOPE_VERSION,
      purpose: params.purpose,
      dataKeyVersion: 1 as const,
      chunkSize,
      plaintextSize: params.plaintext.length,
      noncePrefix: noncePrefix.toString("base64url"),
      tags,
    } satisfies TeamChunkedEncryptedEnvelope,
  };
}

export function decryptTeamChunkWithDataKey(params: {
  teamId: string;
  purpose: TeamKeyPurpose;
  dataKey: Buffer;
  chunkIndex: number;
  ciphertext: Buffer;
  envelope: TeamChunkedEncryptedEnvelope;
}) {
  if (params.dataKey.length !== 32) {
    throw new Error("팀 envelope 데이터 키 길이가 올바르지 않습니다.");
  }
  if (!isTeamChunkedEncryptedEnvelope(params.envelope)) {
    throw new Error("팀 청크 암호화 envelope이 올바르지 않습니다.");
  }
  if (params.envelope.purpose !== params.purpose) {
    throw new Error("팀 청크 암호화 목적이 올바르지 않습니다.");
  }
  const expectedLength = Math.min(
    params.envelope.chunkSize,
    params.envelope.plaintextSize - params.chunkIndex * params.envelope.chunkSize,
  );
  if (
    params.chunkIndex < 0 ||
    params.chunkIndex >= params.envelope.tags.length ||
    params.ciphertext.length !== expectedLength
  ) {
    throw new Error("팀 청크 암호문 범위가 올바르지 않습니다.");
  }
  const noncePrefix = Buffer.from(params.envelope.noncePrefix, "base64url");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    params.dataKey,
    chunkIv(noncePrefix, params.chunkIndex),
  );
  decipher.setAAD(
    chunkAadFor({
      teamId: params.teamId,
      purpose: params.purpose,
      chunkIndex: params.chunkIndex,
      chunkSize: params.envelope.chunkSize,
      plaintextSize: params.envelope.plaintextSize,
    }),
  );
  decipher.setAuthTag(Buffer.from(params.envelope.tags[params.chunkIndex]!, "base64url"));
  return Buffer.concat([decipher.update(params.ciphertext), decipher.final()]);
}

export function decryptTeamChunkedRangeWithDataKey(params: {
  teamId: string;
  purpose: TeamKeyPurpose;
  dataKey: Buffer;
  ciphertext: Buffer;
  ciphertextStart: number;
  start: number;
  end: number;
  envelope: TeamChunkedEncryptedEnvelope;
}) {
  const { envelope } = params;
  if (!isTeamChunkedEncryptedEnvelope(envelope)) {
    throw new Error("팀 청크 암호화 envelope이 올바르지 않습니다.");
  }
  if (
    params.start < 0 ||
    params.end < params.start ||
    params.end >= envelope.plaintextSize
  ) {
    throw new Error("팀 청크 복호화 범위가 올바르지 않습니다.");
  }
  const firstChunk = Math.floor(params.start / envelope.chunkSize);
  const lastChunk = Math.floor(params.end / envelope.chunkSize);
  const plaintextChunks: Buffer[] = [];
  for (let chunkIndex = firstChunk; chunkIndex <= lastChunk; chunkIndex += 1) {
    const absoluteStart = chunkIndex * envelope.chunkSize;
    const absoluteEnd = Math.min(
      envelope.plaintextSize,
      absoluteStart + envelope.chunkSize,
    );
    const relativeStart = absoluteStart - params.ciphertextStart;
    const relativeEnd = absoluteEnd - params.ciphertextStart;
    plaintextChunks.push(
      decryptTeamChunkWithDataKey({
        teamId: params.teamId,
        purpose: params.purpose,
        dataKey: params.dataKey,
        chunkIndex,
        ciphertext: params.ciphertext.subarray(relativeStart, relativeEnd),
        envelope,
      }),
    );
  }
  const joined = Buffer.concat(plaintextChunks);
  const joinedStart = firstChunk * envelope.chunkSize;
  return joined.subarray(params.start - joinedStart, params.end - joinedStart + 1);
}
