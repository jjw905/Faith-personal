import "server-only";

import { Storage } from "@google-cloud/storage";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

let storageClient: Storage | undefined;

function storage() {
  if (!storageClient) {
    const projectId = process.env.GCP_PROJECT_ID?.trim();
    storageClient = new Storage(projectId ? { projectId } : undefined);
  }
  return storageClient;
}

function bucket() {
  return storage().bucket(required("GCS_BUCKET"));
}

function signedUrlTtlSeconds() {
  const parsed = Number(process.env.GCS_SIGNED_URL_TTL_SECONDS ?? 600);
  if (!Number.isFinite(parsed)) return 600;
  return Math.max(60, Math.min(3_600, Math.floor(parsed)));
}

export function gcsConfigured() {
  return Boolean(process.env.GCS_BUCKET?.trim());
}

export async function putObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  await bucket().file(params.key).save(params.body, {
    resumable: false,
    metadata: { contentType: params.contentType },
  });
}

export async function deleteObject(key: string) {
  await bucket().file(key).delete({ ignoreNotFound: true });
}

export async function getDownloadUrl(key: string) {
  const [url] = await bucket().file(key).getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + signedUrlTtlSeconds() * 1_000,
  });
  return url;
}

export async function getUploadUrl(params: {
  key: string;
  contentType: string;
  expiresIn?: number;
}) {
  const ttl = Math.max(
    60,
    Math.min(3_600, Math.floor(params.expiresIn ?? signedUrlTtlSeconds())),
  );
  const [url] = await bucket().file(params.key).getSignedUrl({
    version: "v4",
    action: "write",
    contentType: params.contentType,
    expires: Date.now() + ttl * 1_000,
  });
  return url;
}

export async function headObject(key: string) {
  const [metadata] = await bucket().file(key).getMetadata();
  return {
    size: Number(metadata.size ?? 0),
    contentType: metadata.contentType ?? "application/octet-stream",
  };
}

export async function getObjectBuffer(key: string) {
  const [body] = await bucket().file(key).download();
  return body;
}

/**
 * Signed URL만 발급되고 완료 메타데이터가 저장되지 않은 고아 객체 정리.
 * 참조된 DB 키는 절대 삭제하지 않고, 만료 grace period가 지난 users/ 아래
 * 객체만 대상으로 한다.
 */
export async function purgeUntrackedObjects(params: {
  referencedKeys: ReadonlySet<string>;
  olderThan: Date;
  maxDeletes?: number;
  dryRun?: boolean;
}) {
  const [files] = await bucket().getFiles({ prefix: "users/" });
  const maxDeletes = Math.max(1, Math.floor(params.maxDeletes ?? 500));
  let candidates = 0;
  let deleted = 0;
  let failed = 0;

  for (const file of files) {
    const key = file.name;
    if (params.referencedKeys.has(key)) continue;
    const createdAt = file.metadata.timeCreated
      ? new Date(file.metadata.timeCreated)
      : null;
    if (!createdAt || !Number.isFinite(createdAt.getTime())) continue;
    if (createdAt >= params.olderThan) continue;
    candidates += 1;
    if (params.dryRun || deleted + failed >= maxDeletes) continue;
    try {
      await file.delete({ ignoreNotFound: true });
      deleted += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    scanned: files.length,
    candidates,
    deleted,
    failed,
    dryRun: params.dryRun === true,
  };
}
