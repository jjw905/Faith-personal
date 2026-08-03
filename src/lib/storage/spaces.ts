import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function required(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} 환경변수가 필요합니다.`);
  return v;
}

export function spacesConfigured() {
  const keys = [
    "DO_SPACES_ENDPOINT",
    "DO_SPACES_REGION",
    "DO_SPACES_BUCKET",
    "DO_SPACES_KEY",
    "DO_SPACES_SECRET",
  ] as const;
  return keys.every((name) => Boolean(process.env[name]?.trim()));
}

/** 프로덕션에서는 Spaces 또는 ALLOW_LOCAL_VAULT=1만 허용. */
export function localVaultAllowed() {
  if (spacesConfigured()) return false;
  if (process.env.ALLOW_LOCAL_VAULT === "1") return true;
  return process.env.NODE_ENV !== "production";
}

export function assertVaultBackendReady() {
  if (spacesConfigured()) return;
  if (localVaultAllowed()) return;
  throw new Error("스토리지(DO Spaces) 설정이 없습니다.");
}

function client() {
  const endpoint = required("DO_SPACES_ENDPOINT");
  return new S3Client({
    endpoint,
    region: required("DO_SPACES_REGION"),
    credentials: {
      accessKeyId: required("DO_SPACES_KEY"),
      secretAccessKey: required("DO_SPACES_SECRET"),
    },
    forcePathStyle: false,
  });
}

function bucket() {
  return required("DO_SPACES_BUCKET");
}

export function buildObjectKey(userId: string, fileId: string, name: string) {
  const safe = name.replace(/[^\w.\-()+\uac00-\ud7a3]/g, "_").slice(0, 120);
  return `users/${userId}/${fileId}/${safe}`;
}

/**
 * 업로드 완료 키 검증.
 * `users/{userId}/{fileId}/../other/...`처럼 prefix는 맞지만 resolve 시
 * 타 사용자 디렉터리로 빠지는 상대경로 탈출을 막는다.
 */
export function assertOwnedVaultObjectKey(
  userId: string,
  fileId: string,
  key: string,
) {
  const id = String(userId || "");
  const fid = String(fileId || "");
  const raw = String(key || "");
  if (!id || !fid || !raw) {
    throw new Error("잘못된 저장 경로입니다.");
  }
  if (
    raw.includes("\0") ||
    raw.includes("\\") ||
    raw.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new Error("잘못된 저장 경로입니다.");
  }
  const expectedPrefix = `users/${id}/${fid}/`;
  if (!raw.startsWith(expectedPrefix)) {
    throw new Error("잘못된 저장 경로입니다.");
  }
  // normalize 후에도 동일 접두어·동일 문자열이어야 한다.
  const normalized = raw.replace(/\/{2,}/g, "/");
  if (normalized !== raw || !normalized.startsWith(expectedPrefix)) {
    throw new Error("잘못된 저장 경로입니다.");
  }
  const rest = normalized.slice(expectedPrefix.length);
  if (!rest || rest.includes("/")) {
    // 파일명은 한 세그먼트만 허용 (중첩 디렉터리·탈출 여지 축소)
    throw new Error("잘못된 저장 경로입니다.");
  }
}


export async function putObject(params: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: params.key,
      Body: params.body,
      ContentType: params.contentType,
    }),
  );
}

export async function deleteObject(key: string) {
  await client().send(
    new DeleteObjectCommand({
      Bucket: bucket(),
      Key: key,
    }),
  );
}

export async function getDownloadUrl(
  key: string,
  expiresIn = 60 * 10,
  options?: {
    contentType?: string;
    contentDisposition?: string;
  },
) {
  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ...(options?.contentType
        ? { ResponseContentType: options.contentType }
        : {}),
      ...(options?.contentDisposition
        ? { ResponseContentDisposition: options.contentDisposition }
        : {}),
    }),
    { expiresIn },
  );
}

export async function getUploadUrl(params: {
  key: string;
  contentType: string;
  expiresIn?: number;
}) {
  // ACL 헤더는 브라우저 CORS preflight를 유발하므로 서명에 넣지 않음 (기본 private).
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: params.key,
      ContentType: params.contentType,
    }),
    { expiresIn: params.expiresIn ?? 60 * 10 },
  );
}

export async function headObject(key: string) {
  const res = await client().send(
    new HeadObjectCommand({
      Bucket: bucket(),
      Key: key,
    }),
  );
  return {
    size: res.ContentLength ?? 0,
    contentType: res.ContentType ?? "application/octet-stream",
  };
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await client().send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
    }),
  );
  const body = res.Body;
  if (!body) throw new Error("파일 본문이 비어 있습니다.");
  const bytes = await body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function getObjectRange(
  key: string,
  start: number,
  end: number,
): Promise<Buffer> {
  const res = await client().send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      Range: `bytes=${start}-${end}`,
    }),
  );
  const body = res.Body;
  if (!body) throw new Error("파일 본문이 비어 있습니다.");
  return Buffer.from(await body.transformToByteArray());
}
