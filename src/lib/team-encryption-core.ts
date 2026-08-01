import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

export type TeamKeyPurpose = "content" | "audit";

const TEAM_ENVELOPE_MARKER = "faith-team-envelope";
const TEAM_ENVELOPE_VERSION = 1 as const;

export type TeamEncryptedEnvelope = {
  marker: typeof TEAM_ENVELOPE_MARKER;
  version: typeof TEAM_ENVELOPE_VERSION;
  purpose: TeamKeyPurpose;
  dataKeyVersion: 1;
  iv: string;
  tag: string;
  ciphertext?: string;
};

function aadFor(teamId: string, purpose: TeamKeyPurpose) {
  return Buffer.from(
    `faith-team:${TEAM_ENVELOPE_VERSION}:${teamId}:${purpose}`,
    "utf8",
  );
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
