import { randomUUID } from "crypto";

import type { VaultPurpose } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  localDeleteObject,
  localHeadObject,
  localPutObject,
  localReadObject,
} from "@/lib/storage/local-disk";
import {
  STORAGE_MAX_FILE_BYTES,
  STORAGE_QUOTA_BYTES,
  formatBytes,
} from "@/lib/storage/quota";
import {
  assertVaultBackendReady,
  assertOwnedVaultObjectKey,
  buildObjectKey,
  deleteObject,
  getDownloadUrl,
  getObjectBuffer,
  getUploadUrl,
  headObject,
  localVaultAllowed,
  putObject,
  spacesConfigured,
} from "@/lib/storage/spaces";
import { assertVaultAllowedUpload, safeVaultMime } from "@/lib/vault";

export async function getUserStorageUsage(userId: string) {
  const agg = await prisma.vaultFile.aggregate({
    where: { userId },
    _sum: { size: true },
    _count: true,
  });
  const used = agg._sum.size ?? 0;
  const backend = spacesConfigured()
    ? ("spaces" as const)
    : localVaultAllowed()
      ? ("local" as const)
      : ("unavailable" as const);
  return {
    used,
    quota: STORAGE_QUOTA_BYTES,
    remaining: Math.max(0, STORAGE_QUOTA_BYTES - used),
    count: agg._count,
    backend,
  };
}

export async function listUserVaultFiles(userId: string) {
  return prisma.vaultFile.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      size: true,
      mime: true,
      purpose: true,
      createdAt: true,
    },
  });
}

function assertUploadSize(size: number, used: number) {
  if (size <= 0) throw new Error("빈 파일은 업로드할 수 없습니다.");
  if (size > STORAGE_MAX_FILE_BYTES) {
    throw new Error(
      `파일은 ${formatBytes(STORAGE_MAX_FILE_BYTES)} 이하만 올릴 수 있습니다.`,
    );
  }
  if (used + size > STORAGE_QUOTA_BYTES) {
    throw new Error(
      `저장 공간이 부족합니다. (한도 ${formatBytes(STORAGE_QUOTA_BYTES)}, 사용 ${formatBytes(used)})`,
    );
  }
}

/** 브라우저 → Spaces 직접 업로드용 프리사인. Spaces 없으면 local 모드. */
export async function prepareUserUpload(params: {
  userId: string;
  fileName: string;
  mime: string;
  size: number;
  purpose?: VaultPurpose;
}) {
  assertVaultBackendReady();
  assertVaultAllowedUpload(params.fileName);
  const usage = await getUserStorageUsage(params.userId);
  assertUploadSize(params.size, usage.used);

  const id = randomUUID();
  const mime = safeVaultMime(params.fileName, params.mime);
  const key = buildObjectKey(params.userId, id, params.fileName);
  const purpose = params.purpose ?? ("VAULT" as VaultPurpose);

  if (!spacesConfigured()) {
    if (!localVaultAllowed()) {
      throw new Error("스토리지(DO Spaces) 설정이 없습니다.");
    }
    return {
      mode: "local" as const,
      id,
      key,
      uploadUrl: null as string | null,
      mime,
      purpose,
    };
  }

  const uploadUrl = await getUploadUrl({ key, contentType: mime });
  return {
    mode: "spaces" as const,
    id,
    key,
    uploadUrl,
    mime,
    purpose,
  };
}

/** 로컬 디스크 업로드 완료 + DB 등록 */
export async function completeLocalUpload(params: {
  userId: string;
  id: string;
  key: string;
  fileName: string;
  mime: string;
  size: number;
  purpose?: VaultPurpose;
  body: Buffer;
}) {
  assertVaultBackendReady();
  if (spacesConfigured() || !localVaultAllowed()) {
    throw new Error("로컬 업로드를 사용할 수 없습니다.");
  }
  assertVaultAllowedUpload(params.fileName);
  assertOwnedVaultObjectKey(params.userId, params.id, params.key);
  const usage = await getUserStorageUsage(params.userId);
  assertUploadSize(params.size, usage.used);
  if (params.body.length !== params.size) {
    throw new Error("업로드 파일 크기가 일치하지 않습니다.");
  }
  const mime = safeVaultMime(params.fileName, params.mime);

  await localPutObject(params.key, params.body);
  try {
    return await prisma.vaultFile.create({
      data: {
        id: params.id,
        userId: params.userId,
        name: params.fileName,
        size: params.size,
        mime,
        key: params.key,
        purpose: params.purpose ?? "VAULT",
      },
    });
  } catch (err) {
    await localDeleteObject(params.key).catch(() => undefined);
    throw err;
  }
}

/** 프리사인 업로드 완료 후 DB 등록 */
export async function completeUserUpload(params: {
  userId: string;
  id: string;
  key: string;
  fileName: string;
  mime: string;
  size: number;
  purpose?: VaultPurpose;
}) {
  if (!spacesConfigured()) {
    throw new Error("스토리지(DO Spaces) 설정이 없습니다.");
  }
  assertVaultAllowedUpload(params.fileName);
  assertOwnedVaultObjectKey(params.userId, params.id, params.key);

  const usage = await getUserStorageUsage(params.userId);
  assertUploadSize(params.size, usage.used);
  const mime = safeVaultMime(params.fileName, params.mime);

  let head: { size: number; contentType: string };
  try {
    head = await headObject(params.key);
  } catch {
    throw new Error("업로드된 파일을 확인할 수 없습니다.");
  }
  if (head.size !== params.size) {
    await deleteObject(params.key).catch(() => undefined);
    throw new Error("업로드 파일 크기가 일치하지 않습니다.");
  }

  try {
    return await prisma.vaultFile.create({
      data: {
        id: params.id,
        userId: params.userId,
        name: params.fileName,
        size: params.size,
        mime,
        key: params.key,
        purpose: params.purpose ?? "VAULT",
      },
    });
  } catch (err) {
    await deleteObject(params.key).catch(() => undefined);
    throw err;
  }
}

/** CORS 실패 시 서버가 Spaces로 대신 업로드. */
export async function completeSpacesProxyUpload(params: {
  userId: string;
  id: string;
  key: string;
  fileName: string;
  mime: string;
  size: number;
  purpose?: VaultPurpose;
  body: Buffer;
}) {
  if (!spacesConfigured()) {
    throw new Error("스토리지(DO Spaces) 설정이 없습니다.");
  }
  assertVaultAllowedUpload(params.fileName);
  assertOwnedVaultObjectKey(params.userId, params.id, params.key);
  const usage = await getUserStorageUsage(params.userId);
  assertUploadSize(params.size, usage.used);
  if (params.body.length !== params.size) {
    throw new Error("업로드 파일 크기가 일치하지 않습니다.");
  }

  const mime = safeVaultMime(params.fileName, params.mime);
  await putObject({
    key: params.key,
    body: params.body,
    contentType: mime,
  });

  try {
    return await prisma.vaultFile.create({
      data: {
        id: params.id,
        userId: params.userId,
        name: params.fileName,
        size: params.size,
        mime,
        key: params.key,
        purpose: params.purpose ?? "VAULT",
      },
    });
  } catch (err) {
    await deleteObject(params.key).catch(() => undefined);
    throw err;
  }
}

export async function getUserFileDownloadUrl(userId: string, fileId: string) {
  const row = await prisma.vaultFile.findFirst({
    where: { id: fileId, userId },
  });
  if (!row) return null;

  if (spacesConfigured()) {
    const url = await getDownloadUrl(row.key);
    return { row, url };
  }

  assertVaultBackendReady();
  try {
    await localHeadObject(row.key);
  } catch {
    throw new Error("로컬 저장 파일을 찾을 수 없습니다.");
  }
  return { row, url: `/api/vault/${row.id}/content` };
}

export async function readUserFileContent(userId: string, fileId: string) {
  assertVaultBackendReady();
  if (spacesConfigured() || !localVaultAllowed()) {
    throw new Error("로컬 파일 읽기를 사용할 수 없습니다.");
  }
  const row = await prisma.vaultFile.findFirst({
    where: { id: fileId, userId },
  });
  if (!row) return null;
  const body = await localReadObject(row.key);
  return { row, body };
}

/** Spaces/로컬 공통: STT 등 서버 처리용 바이트 읽기. */
export async function readUserFileBytes(userId: string, fileId: string) {
  assertVaultBackendReady();
  const row = await prisma.vaultFile.findFirst({
    where: { id: fileId, userId },
  });
  if (!row) return null;

  if (spacesConfigured()) {
    const body = await getObjectBuffer(row.key);
    return { row, body };
  }

  if (!localVaultAllowed()) {
    throw new Error("스토리지에서 파일을 읽을 수 없습니다.");
  }
  const body = await localReadObject(row.key);
  return { row, body };
}

export async function deleteUserFile(userId: string, fileId: string) {
  const row = await prisma.vaultFile.findFirst({
    where: { id: fileId, userId },
  });
  if (!row) return false;
  if (spacesConfigured()) {
    await deleteObject(row.key).catch(() => undefined);
  } else {
    assertVaultBackendReady();
    await localDeleteObject(row.key);
  }
  await prisma.vaultFile.delete({ where: { id: fileId } });
  return true;
}

export async function clearUserVault(userId: string) {
  const rows = await prisma.vaultFile.findMany({
    where: { userId },
    select: { id: true, key: true },
  });
  for (const row of rows) {
    if (spacesConfigured()) {
      await deleteObject(row.key).catch(() => undefined);
    } else {
      assertVaultBackendReady();
      await localDeleteObject(row.key);
    }
  }
  await prisma.vaultFile.deleteMany({ where: { userId } });
  return rows.length;
}
