import "server-only";

import { createHash } from "node:crypto";

import {
  CreateKeyCommand,
  KMSClient,
  type Tag,
} from "@aws-sdk/client-kms";
import { KeyManagementServiceClient } from "@google-cloud/kms";

import {
  evaluateKmsProvisioningRuntime,
  kmsProvider,
} from "@/lib/kms-runtime-policy";
import { prisma } from "@/lib/prisma";

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

async function provisionAwsTeamSecurityKeys(
  teamId: string,
  team: { id: string; name: string },
) {
  const region = requireAwsRegion();
  await prisma.teamSecurityKey.upsert({
    where: { teamId },
    create: {
      teamId,
      region,
      status: "PROVISIONING",
    },
    update: {
      region,
      contentKeyArn: null,
      auditKeyArn: null,
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
    return await prisma.teamSecurityKey.update({
      where: { teamId },
      data: {
        contentKeyArn,
        auditKeyArn,
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
      region,
      status: "PROVISIONING",
    },
    update: {
      region,
      contentKeyArn: null,
      auditKeyArn: null,
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
    return await prisma.teamSecurityKey.update({
      where: { teamId },
      data: {
        contentKeyArn,
        auditKeyArn,
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
  if (existing?.status === "ACTIVE") return existing;
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
