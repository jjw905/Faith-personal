import { createHash, randomUUID } from "crypto";

import { Prisma, type VaultPurpose } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  localDeleteObject,
  localHeadObject,
  localPutObject,
  localReadObject,
  localReadObjectRange,
} from "@/lib/storage/local-disk";
import {
  STORAGE_MAX_FILE_BYTES,
  STORAGE_QUOTA_BYTES,
  formatBytes,
} from "@/lib/storage/quota";
import {
  assertOwnedVaultObjectKey,
  buildObjectKey,
} from "@/lib/storage/spaces";
import {
  assertObjectStorageReady,
  deleteObject,
  getDownloadUrl,
  getObjectBuffer,
  getObjectRange,
  getUploadUrl,
  headObject,
  localVaultAllowed,
  objectStorageConfigured,
  putObject,
  storageBackend,
} from "@/lib/storage/object-store";
import {
  createTeamChunkDecryptor,
  decryptTeamChunkedRange,
  decryptTeamBuffer,
  encryptTeamChunkedBuffer,
  isTeamChunkedEncryptedEnvelope,
  isTeamEncryptedEnvelope,
  teamEncryptionRequired,
} from "@/lib/team-encryption";
import { assertVaultAllowedUpload, safeVaultMime } from "@/lib/vault";

function teamObjectKey(teamId: string, fileId: string) {
  const safeTeamId = teamId.replace(/[^A-Za-z0-9_-]/g, "_");
  const safeFileId = fileId.replace(/[^A-Za-z0-9_-]/g, "_");
  return `teams/${safeTeamId}/files/${safeFileId}`;
}

async function readStoredObject(key: string) {
  if (objectStorageConfigured()) return getObjectBuffer(key);
  return localReadObject(key);
}

async function readStoredObjectRange(key: string, start: number, end: number) {
  if (objectStorageConfigured()) return getObjectRange(key, start, end);
  return localReadObjectRange(key, start, end);
}

async function writeStoredObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  if (objectStorageConfigured()) return putObject(params);
  return localPutObject(params.key, params.body);
}

async function deleteStoredObject(key: string) {
  if (objectStorageConfigured()) return deleteObject(key);
  return localDeleteObject(key);
}

export async function getUserStorageUsage(userId: string) {
  const agg = await prisma.vaultFile.aggregate({
    where: { userId },
    _sum: { size: true },
    _count: true,
  });
  const used = agg._sum.size ?? 0;
  const backend = objectStorageConfigured()
    ? storageBackend()
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
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("빈 파일은 업로드할 수 없습니다.");
  }
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

type PersistVaultFileParams = {
  userId: string;
  id: string;
  key: string;
  fileName: string;
  mime: string;
  size: number;
  purpose?: VaultPurpose;
};

function assertMatchingExistingVaultFile(
  row: {
    userId: string;
    key: string;
    name: string;
    size: number;
    mime: string;
    purpose: VaultPurpose;
  },
  params: PersistVaultFileParams,
) {
  if (
    row.userId !== params.userId ||
    row.key !== params.key ||
    row.name !== params.fileName ||
    row.size !== params.size ||
    row.mime !== params.mime ||
    row.purpose !== (params.purpose ?? "VAULT")
  ) {
    throw new Error("업로드 완료 요청이 기존 파일과 일치하지 않습니다.");
  }
}

async function existingVaultFile(params: PersistVaultFileParams) {
  const row = await prisma.vaultFile.findUnique({ where: { id: params.id } });
  if (row) assertMatchingExistingVaultFile(row, params);
  return row;
}

/**
 * 같은 사용자의 동시 업로드가 quota 조회를 우회하지 않도록 DB transaction
 * 안에서 사용자별 advisory lock을 잡고 파일 row를 생성한다.
 */
async function persistVaultFileWithQuota(params: PersistVaultFileParams) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.userId}))`;
          const existing = await tx.vaultFile.findUnique({
            where: { id: params.id },
          });
          if (existing) {
            assertMatchingExistingVaultFile(existing, params);
            return { row: existing, created: false };
          }

          const usage = await tx.vaultFile.aggregate({
            where: { userId: params.userId },
            _sum: { size: true },
          });
          assertUploadSize(params.size, usage._sum.size ?? 0);

          const row = await tx.vaultFile.create({
            data: {
              id: params.id,
              userId: params.userId,
              name: params.fileName,
              size: params.size,
              mime: params.mime,
              key: params.key,
              purpose: params.purpose ?? "VAULT",
            },
          });
          return { row, created: true };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("저장 공간을 예약하지 못했습니다.");
}

/** 브라우저 → 객체 저장소 직접 업로드용 프리사인. 설정이 없으면 local 모드. */
export async function prepareUserUpload(params: {
  userId: string;
  fileName: string;
  mime: string;
  size: number;
  purpose?: VaultPurpose;
}) {
  assertObjectStorageReady();
  assertVaultAllowedUpload(params.fileName);
  const usage = await getUserStorageUsage(params.userId);
  assertUploadSize(params.size, usage.used);

  const id = randomUUID();
  const mime = safeVaultMime(params.fileName, params.mime);
  const key = buildObjectKey(params.userId, id, params.fileName);
  const purpose = params.purpose ?? ("VAULT" as VaultPurpose);

  if (!objectStorageConfigured()) {
    if (!localVaultAllowed()) {
      throw new Error("객체 저장소(GCS/S3) 설정이 없습니다.");
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
    mode: "remote" as const,
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
  assertObjectStorageReady();
  if (objectStorageConfigured() || !localVaultAllowed()) {
    throw new Error("로컬 업로드를 사용할 수 없습니다.");
  }
  assertVaultAllowedUpload(params.fileName);
  assertOwnedVaultObjectKey(params.userId, params.id, params.key);
  if (params.body.length !== params.size) {
    throw new Error("업로드 파일 크기가 일치하지 않습니다.");
  }
  const mime = safeVaultMime(params.fileName, params.mime);
  const persistParams = {
    userId: params.userId,
    id: params.id,
    key: params.key,
    fileName: params.fileName,
    mime,
    size: params.size,
    purpose: params.purpose,
  } satisfies PersistVaultFileParams;
  const existing = await existingVaultFile(persistParams);
  if (existing) return existing;

  await localPutObject(params.key, params.body);
  try {
    const result = await persistVaultFileWithQuota(persistParams);
    return result.row;
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
  if (!objectStorageConfigured()) {
    throw new Error("객체 저장소(GCS/S3) 설정이 없습니다.");
  }
  assertVaultAllowedUpload(params.fileName);
  assertOwnedVaultObjectKey(params.userId, params.id, params.key);

  const mime = safeVaultMime(params.fileName, params.mime);
  const persistParams = {
    userId: params.userId,
    id: params.id,
    key: params.key,
    fileName: params.fileName,
    mime,
    size: params.size,
    purpose: params.purpose,
  } satisfies PersistVaultFileParams;
  const existing = await existingVaultFile(persistParams);
  if (existing) return existing;

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
    const result = await persistVaultFileWithQuota(persistParams);
    return result.row;
  } catch (err) {
    await deleteObject(params.key).catch(() => undefined);
    throw err;
  }
}

/** CORS 실패 시 서버가 객체 저장소로 대신 업로드. */
export async function completeObjectStorageProxyUpload(params: {
  userId: string;
  id: string;
  key: string;
  fileName: string;
  mime: string;
  size: number;
  purpose?: VaultPurpose;
  body: Buffer;
}) {
  if (!objectStorageConfigured()) {
    throw new Error("객체 저장소(GCS/S3) 설정이 없습니다.");
  }
  assertVaultAllowedUpload(params.fileName);
  assertOwnedVaultObjectKey(params.userId, params.id, params.key);
  if (params.body.length !== params.size) {
    throw new Error("업로드 파일 크기가 일치하지 않습니다.");
  }

  const mime = safeVaultMime(params.fileName, params.mime);
  const persistParams = {
    userId: params.userId,
    id: params.id,
    key: params.key,
    fileName: params.fileName,
    mime,
    size: params.size,
    purpose: params.purpose,
  } satisfies PersistVaultFileParams;
  const existing = await existingVaultFile(persistParams);
  if (existing) return existing;

  await putObject({
    key: params.key,
    body: params.body,
    contentType: mime,
  });

  try {
    const result = await persistVaultFileWithQuota(persistParams);
    return result.row;
  } catch (err) {
    await deleteObject(params.key).catch(() => undefined);
    throw err;
  }
}

/**
 * 팀 회의로 연결되는 원본 파일을 팀 content data key로 보호한다.
 * 업로드 API는 팀 선택 전에도 사용할 수 있으므로, 회의 시작 직전에
 * 서버가 객체를 한 번 읽어 암호화된 팀 객체로 교체한다.
 */
export async function protectUserFileForTeam(params: {
  userId: string;
  fileId: string;
  teamId: string;
}) {
  assertObjectStorageReady();
  const row = await prisma.vaultFile.findFirst({
    where: { id: params.fileId, userId: params.userId },
  });
  if (!row) throw new Error("팀 회의 원본 파일을 찾을 수 없습니다.");
  if (row.teamId && row.teamId !== params.teamId) {
    throw new Error("원본 파일이 다른 팀에 연결되어 있습니다.");
  }
  if (
    row.teamId === params.teamId &&
    (isTeamEncryptedEnvelope(row.contentEncryption) ||
      isTeamChunkedEncryptedEnvelope(row.contentEncryption))
  ) {
    return row;
  }

  if (!teamEncryptionRequired()) {
    return prisma.vaultFile.update({
      where: { id: row.id },
      data: { teamId: params.teamId },
    });
  }

  const plaintext = await readStoredObject(row.key);
  const encrypted = await encryptTeamChunkedBuffer({
    teamId: params.teamId,
    purpose: "content",
    plaintext,
  });
  if (!encrypted.encrypted || !encrypted.envelope) {
    return prisma.vaultFile.update({
      where: { id: row.id },
      data: { teamId: params.teamId },
    });
  }

  const encryptedKey = teamObjectKey(params.teamId, row.id);
  await writeStoredObject({
    key: encryptedKey,
    body: encrypted.body,
    contentType: row.mime,
  });
  try {
    const updated = await prisma.vaultFile.update({
      where: { id: row.id },
      data: {
        teamId: params.teamId,
        key: encryptedKey,
        contentEncryption: encrypted.envelope,
      },
    });
    if (row.key !== encryptedKey) {
      await deleteStoredObject(row.key).catch(() => undefined);
    }
    return updated;
  } catch (error) {
    await deleteStoredObject(encryptedKey).catch(() => undefined);
    throw error;
  }
}

export async function getTeamEncryptionInventory() {
  const rows = await prisma.vaultFile.findMany({
    where: { teamId: { not: null }, contentEncryption: { not: Prisma.JsonNull } },
    select: {
      id: true,
      teamId: true,
      key: true,
      name: true,
      size: true,
      contentEncryption: true,
    },
    orderBy: { createdAt: "asc" },
  });
  const files = rows.map((row) => ({
    ...row,
    version: isTeamChunkedEncryptedEnvelope(row.contentEncryption)
      ? 2
      : isTeamEncryptedEnvelope(row.contentEncryption)
        ? 1
        : 0,
  }));
  return {
    total: files.length,
    v1: files.filter((row) => row.version === 1).length,
    v2: files.filter((row) => row.version === 2).length,
    invalid: files.filter((row) => row.version === 0).length,
    v1Bytes: files
      .filter((row) => row.version === 1)
      .reduce((sum, row) => sum + row.size, 0),
    files,
  };
}

/**
 * v1 객체를 별도 키에 v2로 쓰고, 전체 평문 hash 검증 뒤 DB 포인터만 바꾼다.
 * 원본 객체는 절대 삭제하지 않는다. 삭제는 원장 확인 후 별도 승인 작업이다.
 */
export async function rotateTeamFileV1ToV2(fileId: string) {
  assertObjectStorageReady();
  const row = await prisma.vaultFile.findUnique({ where: { id: fileId } });
  if (!row || !row.teamId) throw new Error("회전할 팀 파일을 찾을 수 없습니다.");
  if (isTeamChunkedEncryptedEnvelope(row.contentEncryption)) {
    return { status: "already-v2" as const, fileId: row.id, key: row.key };
  }
  if (!isTeamEncryptedEnvelope(row.contentEncryption)) {
    throw new Error("v1 팀 암호화 파일이 아닙니다.");
  }

  const originalKey = row.key;
  const targetKey = `${teamObjectKey(row.teamId, row.id)}.v2-rotation`;
  await prisma.encryptionRotation.upsert({
    where: { vaultFileId: row.id },
    create: {
      vaultFileId: row.id,
      teamId: row.teamId,
      originalKey,
      targetKey,
      originalSize: row.size,
      status: "RUNNING",
      attemptCount: 1,
      startedAt: new Date(),
    },
    update: {
      status: "RUNNING",
      errorMessage: null,
      startedAt: new Date(),
      attemptCount: { increment: 1 },
    },
  });

  try {
    // v1 AES-GCM은 인증 특성상 전체 암호문/평문을 한 번에 열어야 한다.
    const ciphertext = await readStoredObject(originalKey);
    const plaintext = await decryptTeamBuffer({
      teamId: row.teamId,
      purpose: "content",
      body: ciphertext,
      envelope: row.contentEncryption,
    });
    if (plaintext.length !== row.size) {
      throw new Error("v1 복호화 크기와 VaultFile.size가 다릅니다.");
    }
    const plaintextSha256 = createHash("sha256").update(plaintext).digest("hex");
    const encrypted = await encryptTeamChunkedBuffer({
      teamId: row.teamId,
      purpose: "content",
      plaintext,
    });
    if (!encrypted.encrypted || !encrypted.envelope) {
      throw new Error("KMS v2 envelope을 만들지 못했습니다.");
    }
    await writeStoredObject({
      key: targetKey,
      body: encrypted.body,
      contentType: row.mime,
    });

    const stored = await readStoredObject(targetKey);
    const verifiedPlaintext =
      plaintext.length === 0
        ? Buffer.alloc(0)
        : await decryptTeamChunkedRange({
            teamId: row.teamId,
            purpose: "content",
            body: stored,
            ciphertextStart: 0,
            start: 0,
            end: plaintext.length - 1,
            envelope: encrypted.envelope,
          });
    const verifiedSha256 = createHash("sha256")
      .update(verifiedPlaintext)
      .digest("hex");
    if (
      verifiedPlaintext.length !== plaintext.length ||
      verifiedSha256 !== plaintextSha256
    ) {
      throw new Error("v2 전체 복호화 hash 검증에 실패했습니다.");
    }

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const swapped = await tx.vaultFile.updateMany({
        where: { id: row.id, key: originalKey },
        data: {
          key: targetKey,
          contentEncryption: encrypted.envelope as unknown as Prisma.InputJsonValue,
        },
      });
      if (swapped.count !== 1) {
        throw new Error("회전 중 VaultFile 포인터가 바뀌어 교체를 중단했습니다.");
      }
      await tx.encryptionRotation.update({
        where: { vaultFileId: row.id },
        data: {
          status: "SWAPPED",
          targetSize: encrypted.body.length,
          plaintextSha256,
          verifiedAt: now,
          swappedAt: now,
          errorMessage: null,
        },
      });
    });
    return {
      status: "swapped" as const,
      fileId: row.id,
      originalKey,
      targetKey,
      bytes: plaintext.length,
      plaintextSha256,
      originalPreserved: true,
    };
  } catch (error) {
    await prisma.encryptionRotation.update({
      where: { vaultFileId: row.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export async function getUserFileDownloadUrl(userId: string, fileId: string) {
  const row = await prisma.vaultFile.findFirst({
    where: { id: fileId, userId },
  });
  if (!row) return null;

  if (row.contentEncryption) {
    return { row, url: `/api/vault/${encodeURIComponent(row.id)}/content` };
  }

  if (objectStorageConfigured()) {
    const url = await getDownloadUrl(row.key);
    return { row, url };
  }

  assertObjectStorageReady();
  try {
    await localHeadObject(row.key);
  } catch {
    throw new Error("로컬 저장 파일을 찾을 수 없습니다.");
  }
  return { row, url: `/api/vault/${row.id}/content` };
}

export async function readUserFileContent(userId: string, fileId: string) {
  assertObjectStorageReady();
  if (objectStorageConfigured() || !localVaultAllowed()) {
    throw new Error("로컬 파일 읽기를 사용할 수 없습니다.");
  }
  return readUserFileBytes(userId, fileId);
}

/** GCS/S3/로컬 공통: STT 등 서버 처리용 바이트 읽기. */
export async function readUserFileBytes(userId: string, fileId: string) {
  assertObjectStorageReady();
  const row = await prisma.vaultFile.findFirst({
    where: { id: fileId, userId },
  });
  if (!row) return null;

  if (objectStorageConfigured()) {
    const body = await getObjectBuffer(row.key);
    if (!row.contentEncryption) return { row, body };
    if (!row.teamId) {
      throw new Error("팀 파일 암호화 메타데이터가 올바르지 않습니다.");
    }
    if (isTeamChunkedEncryptedEnvelope(row.contentEncryption)) {
      return {
        row,
        body:
          row.contentEncryption.plaintextSize === 0
            ? Buffer.alloc(0)
            : await decryptTeamChunkedRange({
                teamId: row.teamId,
                purpose: "content",
                body,
                ciphertextStart: 0,
                start: 0,
                end: row.contentEncryption.plaintextSize - 1,
                envelope: row.contentEncryption,
              }),
      };
    }
    if (!isTeamEncryptedEnvelope(row.contentEncryption)) {
      throw new Error("팀 파일 암호화 메타데이터가 올바르지 않습니다.");
    }
    return {
      row,
      body: await decryptTeamBuffer({
        teamId: row.teamId,
        purpose: "content",
        body,
        envelope: row.contentEncryption,
      }),
    };
  }

  if (!localVaultAllowed()) {
    throw new Error("스토리지에서 파일을 읽을 수 없습니다.");
  }
  const body = await localReadObject(row.key);
  if (!row.contentEncryption) return { row, body };
  if (!row.teamId) {
    throw new Error("팀 파일 암호화 메타데이터가 올바르지 않습니다.");
  }
  if (isTeamChunkedEncryptedEnvelope(row.contentEncryption)) {
    return {
      row,
      body:
        row.contentEncryption.plaintextSize === 0
          ? Buffer.alloc(0)
          : await decryptTeamChunkedRange({
              teamId: row.teamId,
              purpose: "content",
              body,
              ciphertextStart: 0,
              start: 0,
              end: row.contentEncryption.plaintextSize - 1,
              envelope: row.contentEncryption,
            }),
    };
  }
  if (!isTeamEncryptedEnvelope(row.contentEncryption)) {
    throw new Error("팀 파일 암호화 메타데이터가 올바르지 않습니다.");
  }
  return {
    row,
    body: await decryptTeamBuffer({
      teamId: row.teamId,
      purpose: "content",
      body,
      envelope: row.contentEncryption,
    }),
  };
}

/**
 * 신규 v2 팀 암호문은 요청 범위와 겹치는 인증 청크만 저장소에서 읽는다.
 * v1 전체-file GCM은 인증 태그 특성상 전체 복호화가 필요해 호환 경로로 남긴다.
 */
export async function readUserFileRange(params: {
  userId: string;
  fileId: string;
  start: number;
  end: number;
}) {
  assertObjectStorageReady();
  const row = await prisma.vaultFile.findFirst({
    where: { id: params.fileId, userId: params.userId },
  });
  if (!row) return null;
  if (
    !Number.isSafeInteger(params.start) ||
    !Number.isSafeInteger(params.end) ||
    params.start < 0 ||
    params.end < params.start ||
    params.end >= row.size
  ) {
    throw new Error("파일 읽기 범위가 올바르지 않습니다.");
  }

  if (!row.contentEncryption) {
    return {
      row,
      body: await readStoredObjectRange(row.key, params.start, params.end),
      total: row.size,
      rangeOptimized: true,
    };
  }
  if (!row.teamId) {
    throw new Error("팀 파일 암호화 메타데이터가 올바르지 않습니다.");
  }
  if (!isTeamChunkedEncryptedEnvelope(row.contentEncryption)) {
    const full = await readUserFileBytes(params.userId, params.fileId);
    if (!full) return null;
    return {
      row: full.row,
      body: full.body.subarray(params.start, params.end + 1),
      total: full.body.length,
      rangeOptimized: false,
    };
  }

  const envelope = row.contentEncryption;
  if (params.end >= envelope.plaintextSize || envelope.plaintextSize !== row.size) {
    throw new Error("팀 파일 크기와 암호화 메타데이터가 일치하지 않습니다.");
  }
  const firstChunk = Math.floor(params.start / envelope.chunkSize);
  const lastChunk = Math.floor(params.end / envelope.chunkSize);
  const ciphertextStart = firstChunk * envelope.chunkSize;
  const ciphertextEnd = Math.min(
    envelope.plaintextSize - 1,
    (lastChunk + 1) * envelope.chunkSize - 1,
  );
  const ciphertext = await readStoredObjectRange(
    row.key,
    ciphertextStart,
    ciphertextEnd,
  );
  return {
    row,
    body: await decryptTeamChunkedRange({
      teamId: row.teamId,
      purpose: "content",
      body: ciphertext,
      ciphertextStart,
      start: params.start,
      end: params.end,
      envelope,
    }),
    total: envelope.plaintextSize,
    rangeOptimized: true,
  };
}

/** Range 없는 전체 응답도 1MiB 단위로 읽고 인증·복호화해 메모리를 제한한다. */
export async function streamUserChunkedFile(userId: string, fileId: string) {
  assertObjectStorageReady();
  const row = await prisma.vaultFile.findFirst({
    where: { id: fileId, userId },
  });
  if (
    !row ||
    !row.teamId ||
    !isTeamChunkedEncryptedEnvelope(row.contentEncryption)
  ) {
    return null;
  }
  const envelope = row.contentEncryption;
  if (envelope.plaintextSize !== row.size) {
    throw new Error("팀 파일 크기와 암호화 메타데이터가 일치하지 않습니다.");
  }
  const decryptChunk = await createTeamChunkDecryptor({
    teamId: row.teamId,
    purpose: "content",
    envelope,
  });
  let chunkIndex = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (chunkIndex >= envelope.tags.length) {
        controller.close();
        return;
      }
      try {
        const start = chunkIndex * envelope.chunkSize;
        const end = Math.min(
          envelope.plaintextSize - 1,
          start + envelope.chunkSize - 1,
        );
        const ciphertext = await readStoredObjectRange(row.key, start, end);
        const plaintext = decryptChunk(chunkIndex, ciphertext);
        chunkIndex += 1;
        controller.enqueue(plaintext);
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return { row, stream, total: envelope.plaintextSize };
}

export async function deleteUserFile(userId: string, fileId: string) {
  const row = await prisma.vaultFile.findFirst({
    where: { id: fileId, userId },
  });
  if (!row) return false;
  if (objectStorageConfigured()) {
    await deleteObject(row.key);
  } else {
    assertObjectStorageReady();
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
    if (objectStorageConfigured()) {
      await deleteObject(row.key);
    } else {
      assertObjectStorageReady();
      await localDeleteObject(row.key);
    }
  }
  await prisma.vaultFile.deleteMany({ where: { userId } });
  return rows.length;
}
