import "server-only";

import {
  deleteObject as deleteSpacesObject,
  getDownloadUrl as getSpacesDownloadUrl,
  getObjectBuffer as getSpacesObjectBuffer,
  getUploadUrl as getSpacesUploadUrl,
  headObject as headSpacesObject,
  putObject as putSpacesObject,
  spacesConfigured,
} from "@/lib/storage/spaces";
import {
  deleteObject as deleteGcsObject,
  getDownloadUrl as getGcsDownloadUrl,
  getObjectBuffer as getGcsObjectBuffer,
  getUploadUrl as getGcsUploadUrl,
  gcsConfigured,
  headObject as headGcsObject,
  putObject as putGcsObject,
  purgeUntrackedObjects as purgeGcsUntrackedObjects,
} from "@/lib/storage/gcs";

export type ObjectStorageBackend = "local" | "s3" | "gcs";

export function storageBackend(): ObjectStorageBackend {
  const configured = process.env.STORAGE_BACKEND?.trim().toLowerCase();
  if (configured === "gcs") return "gcs";
  if (configured === "s3" || configured === "spaces") return "s3";
  if (gcsConfigured()) return "gcs";
  if (spacesConfigured()) return "s3";
  return "local";
}

export function objectStorageConfigured() {
  const backend = storageBackend();
  return backend === "gcs" ? gcsConfigured() : backend === "s3" ? spacesConfigured() : false;
}

export function localVaultAllowed() {
  if (objectStorageConfigured()) return false;
  if (process.env.ALLOW_LOCAL_VAULT === "1") return true;
  return process.env.NODE_ENV !== "production";
}

export function assertObjectStorageReady() {
  if (objectStorageConfigured() || localVaultAllowed()) return;
  throw new Error("객체 저장소(GCS/S3) 설정이 없습니다.");
}

export async function putObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  if (storageBackend() === "gcs") return putGcsObject(params);
  return putSpacesObject(params);
}

export async function deleteObject(key: string) {
  if (storageBackend() === "gcs") return deleteGcsObject(key);
  return deleteSpacesObject(key);
}

export async function getDownloadUrl(key: string, expiresIn?: number) {
  if (storageBackend() === "gcs") return getGcsDownloadUrl(key);
  return getSpacesDownloadUrl(key, expiresIn);
}

export async function getUploadUrl(params: {
  key: string;
  contentType: string;
  expiresIn?: number;
}) {
  if (storageBackend() === "gcs") return getGcsUploadUrl(params);
  return getSpacesUploadUrl(params);
}

export async function headObject(key: string) {
  if (storageBackend() === "gcs") return headGcsObject(key);
  return headSpacesObject(key);
}

export async function getObjectBuffer(key: string) {
  if (storageBackend() === "gcs") return getGcsObjectBuffer(key);
  return getSpacesObjectBuffer(key);
}

export async function purgeUntrackedObjects(params: {
  referencedKeys: ReadonlySet<string>;
  olderThan: Date;
  maxDeletes?: number;
  dryRun?: boolean;
}) {
  if (storageBackend() !== "gcs") {
    return {
      supported: false as const,
      scanned: 0,
      candidates: 0,
      deleted: 0,
      failed: 0,
      dryRun: params.dryRun === true,
    };
  }
  return {
    supported: true as const,
    ...(await purgeGcsUntrackedObjects(params)),
  };
}
