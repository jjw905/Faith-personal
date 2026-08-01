import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  CreateKeyCommand,
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
  type Tag,
} from "@aws-sdk/client-kms";
import { KeyManagementServiceClient } from "@google-cloud/kms";

import {
  evaluateKmsProvisioningRuntime,
  kmsProvider,
} from "@/lib/kms-runtime-policy";
import { prisma } from "@/lib/prisma";

export type TeamKeyPurpose = "content" | "audit";

const DATA_KEY_BYTES = 32;
const DATA_KEY_CACHE_TTL_MS = 5 * 60_000;
const MAX_DATA_KEY_CACHE_ENTRIES = 128;

type DataKeyMaterial = {
  plaintext: Buffer;
  ciphertext: string;
};

type ExistingTeamSecurityKey = {
  teamId: string;
  provider: "AWS" | "GCP" | null;
  region: string;
  contentKeyArn: string | null;
  auditKeyArn: string | null;
  contentDataKeyCiphertext: string | null;
  auditDataKeyCiphertext: string | null;
  status: "PROVISIONING" | "ACTIVE" | "FAILED";
  updatedAt: Date;
};

const dataKeyCache = new Map<
  string,
  { value: Buffer; expiresAt: number }
>();

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function requireAwsRegion() {
  const region = process.env.AWS_REGION?.trim();
  if (!region) throw new Error("AWS_REGION이 필요합니다.");
  return region;
}

function keyTags(teamId: string, purpose: "content" | "audit"): Tag[] {
  return [
    { TagKey: "faith:team-id", TagValue: teamId },
    { TagKey: "faith:key-purpose", TagValue: purpose },
    { TagKey: "faith:managed-by", TagValue: "faith-web" },
  ];
}

async function createTeamKey(
  client: KMSClient,
  params: {
    teamId: string;
    teamName: string;
    purpose: "content" | "audit";
  },
) {
  const response = await client.send(
    new CreateKeyCommand({
      Description: `Faith team ${params.teamName} ${params.purpose} encryption key`,
      KeyUsage: "ENCRYPT_DECRYPT",
      KeySpec: "SYMMETRIC_DEFAULT",
      Tags: keyTags(params.teamId, params.purpose),
    }),
  );
  const arn = response.KeyMetadata?.Arn;
  if (!arn) {
    throw new Error(`${params.purpose} KMS 키 ARN을 받지 못했습니다.`);
  }
  return arn;
}

function encoded(value: string | Uint8Array) {
  return typeof value === "string"
    ? Buffer.from(value, "base64").toString("base64url")
    : Buffer.from(value).toString("base64url");
}

function bytes(value: string | Uint8Array) {
  return typeof value === "string"
    ? Buffer.from(value, "base64")
    : Buffer.from(value);
}

function decoded(value: string) {
  return Buffer.from(value, "base64url");
}

async function generateAwsDataKey(client: KMSClient, keyArn: string) {
  const response = await client.send(
    new GenerateDataKeyCommand({
      KeyId: keyArn,
      KeySpec: "AES_256",
    }),
  );
  if (!response.Plaintext || !response.CiphertextBlob) {
    throw new Error("AWS KMS 데이터 키를 받지 못했습니다.");
  }
  return {
    plaintext: bytes(response.Plaintext),
    ciphertext: encoded(response.CiphertextBlob),
  } satisfies DataKeyMaterial;
}

async function unwrapAwsDataKey(
  client: KMSClient,
  ciphertext: string,
) {
  const response = await client.send(
    new DecryptCommand({
      CiphertextBlob: decoded(ciphertext),
    }),
  );
  if (!response.Plaintext) {
    throw new Error("AWS KMS 데이터 키를 복호화하지 못했습니다.");
  }
  return bytes(response.Plaintext);
}

function requireGcpConfig() {
  const projectId = process.env.GCP_PROJECT_ID?.trim();
  const location = process.env.GCP_KMS_LOCATION?.trim();
  const keyRing = process.env.GCP_KMS_TEAM_KEY_RING?.trim();
  if (!projectId || !location || !keyRing) {
    throw new Error(
      "GCP_PROJECT_ID, GCP_KMS_LOCATION, GCP_KMS_TEAM_KEY_RING이 필요합니다.",
    );
  }
  return { projectId, location, keyRing };
}

async function generateGcpDataKey(
  client: KeyManagementServiceClient,
  keyName: string,
) {
  const plaintext = randomBytes(DATA_KEY_BYTES);
  const [response] = await client.encrypt({
    name: keyName,
    plaintext,
  });
  if (!response.ciphertext) {
    throw new Error("GCP KMS 데이터 키를 받지 못했습니다.");
  }
  return {
    plaintext,
    ciphertext: encoded(response.ciphertext),
  } satisfies DataKeyMaterial;
}

async function unwrapGcpDataKey(
  client: KeyManagementServiceClient,
  keyName: string,
  ciphertext: string,
) {
  const [response] = await client.decrypt({
    name: keyName,
    ciphertext: decoded(ciphertext),
  });
  if (!response.plaintext) {
    throw new Error("GCP KMS 데이터 키를 복호화하지 못했습니다.");
  }
  return bytes(response.plaintext);
}

function gcpKeyId(teamId: string, purpose: "content" | "audit") {
  const digest = createHash("sha256").update(teamId).digest("hex").slice(0, 24);
  return `faith-${purpose}-${digest}`;
}

async function createGcpTeamKey(
  client: KeyManagementServiceClient,
  params: {
    parent: string;
    teamId: string;
    purpose: "content" | "audit";
  },
) {
  const keyId = gcpKeyId(params.teamId, params.purpose);
  const name = `${params.parent}/cryptoKeys/${keyId}`;
  try {
    const [response] = await client.createCryptoKey({
      parent: params.parent,
      cryptoKeyId: keyId,
      cryptoKey: {
        purpose: "ENCRYPT_DECRYPT",
        labels: {
          "faith-team-hash": createHash("sha256")
            .update(params.teamId)
            .digest("hex")
            .slice(0, 32),
          "faith-key-purpose": params.purpose,
          "faith-managed-by": "faith-web",
        },
      },
    });
    return response.name ?? name;
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 6 || /already exists/i.test(errorMessage(error))) {
      return name;
    }
    throw error;
  }
}

async function ensureGcpCryptoKeyVersion(
  client: KeyManagementServiceClient,
  keyName: string,
) {
  const [key] = await client.getCryptoKey({ name: keyName });
  if (key.primary?.name) return;
  await client.createCryptoKeyVersion({
    parent: keyName,
    cryptoKeyVersion: {
      algorithm: "GOOGLE_SYMMETRIC_ENCRYPTION",
    },
  });
}

async function provisionAwsTeamSecurityKeys(
  teamId: string,
  team: { id: string; name: string },
) {
  const region = requireAwsRegion();
  await prisma.teamSecurityKey.upsert({
    where: { teamId },
    create: {
      teamId,
      provider: "AWS",
      region,
      status: "PROVISIONING",
    },
    update: {
      provider: "AWS",
      region,
      contentKeyArn: null,
      auditKeyArn: null,
      contentDataKeyCiphertext: null,
      auditDataKeyCiphertext: null,
      status: "PROVISIONING",
      lastError: null,
    },
  });

  const client = new KMSClient({ region });
  try {
    const contentKeyArn = await createTeamKey(client, {
      teamId: team.id,
      teamName: team.name,
      purpose: "content",
    });
    const auditKeyArn = await createTeamKey(client, {
      teamId: team.id,
      teamName: team.name,
      purpose: "audit",
    });
    const [contentDataKey, auditDataKey] = await Promise.all([
      generateAwsDataKey(client, contentKeyArn),
      generateAwsDataKey(client, auditKeyArn),
    ]);
    return await prisma.teamSecurityKey.update({
      where: { teamId },
      data: {
        provider: "AWS",
        contentKeyArn,
        auditKeyArn,
        contentDataKeyCiphertext: contentDataKey.ciphertext,
        auditDataKeyCiphertext: auditDataKey.ciphertext,
        status: "ACTIVE",
        lastError: null,
      },
    });
  } catch (error) {
    const lastError = errorMessage(error);
    await prisma.teamSecurityKey.update({
      where: { teamId },
      data: { status: "FAILED", lastError },
    });
    throw new Error(`팀 KMS 키를 생성하지 못했습니다: ${lastError}`);
  } finally {
    client.destroy();
  }
}

async function provisionGcpTeamSecurityKeys(
  teamId: string,
  team: { id: string; name: string },
) {
  const { projectId, location, keyRing } = requireGcpConfig();
  const region = location;
  const parent = `projects/${projectId}/locations/${location}/keyRings/${keyRing}`;
  await prisma.teamSecurityKey.upsert({
    where: { teamId },
    create: {
      teamId,
      provider: "GCP",
      region,
      status: "PROVISIONING",
    },
    update: {
      provider: "GCP",
      region,
      contentKeyArn: null,
      auditKeyArn: null,
      contentDataKeyCiphertext: null,
      auditDataKeyCiphertext: null,
      status: "PROVISIONING",
      lastError: null,
    },
  });

  const client = new KeyManagementServiceClient();
  try {
    const contentKeyArn = await createGcpTeamKey(client, {
      parent,
      teamId: team.id,
      purpose: "content",
    });
    const auditKeyArn = await createGcpTeamKey(client, {
      parent,
      teamId: team.id,
      purpose: "audit",
    });
    await Promise.all([
      ensureGcpCryptoKeyVersion(client, contentKeyArn),
      ensureGcpCryptoKeyVersion(client, auditKeyArn),
    ]);
    const [contentDataKey, auditDataKey] = await Promise.all([
      generateGcpDataKey(client, contentKeyArn),
      generateGcpDataKey(client, auditKeyArn),
    ]);
    return await prisma.teamSecurityKey.update({
      where: { teamId },
      data: {
        provider: "GCP",
        contentKeyArn,
        auditKeyArn,
        contentDataKeyCiphertext: contentDataKey.ciphertext,
        auditDataKeyCiphertext: auditDataKey.ciphertext,
        status: "ACTIVE",
        lastError: null,
      },
    });
  } catch (error) {
    const lastError = errorMessage(error);
    await prisma.teamSecurityKey.update({
      where: { teamId },
      data: { status: "FAILED", lastError },
    });
    throw new Error(`팀 GCP KMS 키를 생성하지 못했습니다: ${lastError}`);
  } finally {
    await client.close();
  }
}

export async function provisionTeamSecurityKeys(teamId: string) {
  const runtime = evaluateKmsProvisioningRuntime();
  if (!runtime.allowed) {
    const detail =
      runtime.reason === "missing_configuration"
        ? ` (${runtime.missing?.join(", ")})`
        : "";
    throw new Error(`팀 KMS 생성을 사용할 수 없는 실행 환경입니다${detail}.`);
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true },
  });
  if (!team) throw new Error("팀을 찾을 수 없습니다.");

  const existing = await prisma.teamSecurityKey.findUnique({
    where: { teamId },
  });
  const expectedProvider = kmsProvider() === "gcp" ? "GCP" : "AWS";
  if (
    existing?.status === "ACTIVE" &&
    existing.provider === expectedProvider &&
    existing.contentKeyArn &&
    existing.auditKeyArn &&
    existing.contentDataKeyCiphertext &&
    existing.auditDataKeyCiphertext
  ) {
    return existing;
  }
  if (
    existing?.status === "PROVISIONING" &&
    Date.now() - existing.updatedAt.getTime() < 10 * 60_000
  ) {
    return existing;
  }

  return kmsProvider() === "gcp"
    ? provisionGcpTeamSecurityKeys(teamId, team)
    : provisionAwsTeamSecurityKeys(teamId, team);
}

function dataKeyCacheKey(
  teamId: string,
  purpose: TeamKeyPurpose,
  provider: "AWS" | "GCP",
  updatedAt: Date,
) {
  return `${provider}:${teamId}:${purpose}:${updatedAt.getTime()}`;
}

function cacheDataKey(key: string, value: Buffer) {
  if (dataKeyCache.size >= MAX_DATA_KEY_CACHE_ENTRIES) {
    const first = dataKeyCache.keys().next().value;
    if (first) dataKeyCache.delete(first);
  }
  dataKeyCache.set(key, {
    value,
    expiresAt: Date.now() + DATA_KEY_CACHE_TTL_MS,
  });
}

function runtimeError() {
  const decision = evaluateKmsProvisioningRuntime();
  const detail =
    !decision.allowed && decision.reason === "missing_configuration"
      ? ` (${decision.missing?.join(", ")})`
      : "";
  return new Error(`팀 KMS 데이터 키를 사용할 수 없는 실행 환경입니다${detail}.`);
}

export function clearTeamDataKeyCache(teamId?: string) {
  if (!teamId) {
    dataKeyCache.clear();
    return;
  }
  for (const key of dataKeyCache.keys()) {
    if (key.includes(`:${teamId}:`)) dataKeyCache.delete(key);
  }
}

export async function getTeamDataKey(
  teamId: string,
  purpose: TeamKeyPurpose,
) {
  const runtime = evaluateKmsProvisioningRuntime();
  if (!runtime.allowed) throw runtimeError();

  const provider = kmsProvider();
  if (!provider) throw runtimeError();
  const row: ExistingTeamSecurityKey | null =
    await prisma.teamSecurityKey.findUnique({
      where: { teamId },
      select: {
        teamId: true,
        provider: true,
        region: true,
        contentKeyArn: true,
        auditKeyArn: true,
        contentDataKeyCiphertext: true,
        auditDataKeyCiphertext: true,
        updatedAt: true,
        status: true,
      },
    });
  const expectedProvider = provider === "gcp" ? "GCP" : "AWS";
  if (
    !row ||
    row.status !== "ACTIVE" ||
    row.provider !== expectedProvider
  ) {
    throw new Error("팀 보안 키가 아직 준비되지 않았습니다.");
  }

  const dataKeyCiphertext =
    purpose === "content"
      ? row.contentDataKeyCiphertext
      : row.auditDataKeyCiphertext;
  const kmsKey =
    purpose === "content" ? row.contentKeyArn : row.auditKeyArn;
  if (!dataKeyCiphertext || !kmsKey) {
    throw new Error("팀 KMS 데이터 키 설정이 완전하지 않습니다.");
  }

  const cacheKey = dataKeyCacheKey(
    teamId,
    purpose,
    expectedProvider,
    row.updatedAt,
  );
  const cached = dataKeyCache.get(cacheKey);
  if (cached) {
    if (cached.expiresAt > Date.now()) return Buffer.from(cached.value);
    dataKeyCache.delete(cacheKey);
  }

  let plaintext: Buffer;
  if (provider === "aws") {
    const client = new KMSClient({ region: row.region });
    try {
      plaintext = await unwrapAwsDataKey(client, dataKeyCiphertext);
    } finally {
      client.destroy();
    }
  } else {
    const client = new KeyManagementServiceClient();
    try {
      plaintext = await unwrapGcpDataKey(
        client,
        kmsKey,
        dataKeyCiphertext,
      );
    } finally {
      await client.close();
    }
  }

  if (plaintext.length !== DATA_KEY_BYTES) {
    throw new Error("팀 KMS 데이터 키 길이가 올바르지 않습니다.");
  }
  cacheDataKey(cacheKey, plaintext);
  return Buffer.from(plaintext);
}
