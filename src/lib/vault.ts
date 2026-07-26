/** 보관함 클라이언트 — DO Spaces + DB API 연동. */

export const VAULT_CHANGED_EVENT = "faith.vault.changed";
export const VAULT_MAX_BYTES = 100 * 1024 * 1024;
export const VAULT_QUOTA_BYTES = 500 * 1024 * 1024;

/** 보관함·채팅 첨부에 허용하는 확장자. */
export const VAULT_ALLOWED_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".wav",
  ".ogg",
  ".flac",
  ".webm",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".hwp",
  ".hwpx",
  ".txt",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".heic",
  ".heif",
  ".gif",
] as const;

const VAULT_ALLOWED_EXT_SET = new Set<string>(VAULT_ALLOWED_EXTENSIONS);

export function vaultFileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i).toLowerCase();
}

export function isVaultAllowedFile(name: string): boolean {
  return VAULT_ALLOWED_EXT_SET.has(vaultFileExtension(name));
}

/** 형식·단일 용량·보관함 한도. 문제 있으면 안내 문구. */
export function validateVaultUploadFiles(
  files: File[],
  remainingBytes: number | null,
): string | null {
  if (files.length === 0) return null;

  const unsupported = files.filter((file) => !isVaultAllowedFile(file.name));
  if (unsupported.length > 0) {
    const labels = unsupported
      .map((file) => vaultFileExtension(file.name) || file.name)
      .filter((value, index, all) => all.indexOf(value) === index)
      .slice(0, 3);
    return `지원하지 않는 형식입니다. (${labels.join(", ")})`;
  }

  const tooLarge = files.find((file) => file.size > VAULT_MAX_BYTES);
  if (tooLarge) {
    return `파일은 ${formatVaultSize(VAULT_MAX_BYTES)} 이하만 올릴 수 있습니다.`;
  }

  if (remainingBytes != null) {
    const total = files.reduce((sum, file) => sum + file.size, 0);
    if (total > remainingBytes) {
      return `보관함 허용 용량을 초과합니다. (남은 용량 ${formatVaultSize(Math.max(0, remainingBytes))})`;
    }
  }

  return null;
}

export type VaultItemMeta = {
  id: string;
  name: string;
  size: number;
  mime: string;
  createdAt: string;
  purpose?: "VAULT" | "MEETING";
};

export type VaultUsage = {
  used: number;
  quota: number;
  remaining: number;
  count: number;
};

export type VaultItem = VaultItemMeta & {
  blob: Blob;
};

export function formatVaultSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function notifyVaultChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(VAULT_CHANGED_EVENT));
}

/** name.ext → base / .ext */
export function splitFileName(name: string): { base: string; ext: string } {
  const i = name.lastIndexOf(".");
  if (i <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, i), ext: name.slice(i) };
}

/** 동일 이름이 있으면 `이름 (1).ext`, `이름 (2).ext` … */
export function nextDuplicateFileName(
  name: string,
  existingNames: string[],
): string {
  const names = new Set(existingNames);
  if (!names.has(name)) return name;
  const { base, ext } = splitFileName(name);
  let n = 1;
  while (names.has(`${base} (${n})${ext}`)) n += 1;
  return `${base} (${n})${ext}`;
}

export function renameFile(file: File, name: string): File {
  return new File([file], name, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

/**
 * 응답을 JSON으로 안전 파싱. 서버가 HTML 오류 페이지(500/413/프록시)를 주면
 * "Unexpected token '<'" 대신 상태 코드 기반의 사람이 읽을 메시지로 변환.
 */
async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const byStatus =
      res.status === 413
        ? "파일이 너무 커서 업로드할 수 없습니다."
        : res.status === 401 || res.status === 403
          ? "로그인이 필요합니다."
          : res.status >= 500
            ? "서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
            : "요청을 처리하지 못했습니다.";
    throw new Error(byStatus);
  }
}

export async function listVaultItems(): Promise<VaultItemMeta[]> {
  const res = await fetch("/api/vault", { cache: "no-store" });
  const data = await readJson<{
    ok: boolean;
    items?: VaultItemMeta[];
    usage?: VaultUsage;
    message?: string;
  }>(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.message ?? "보관함을 불러오지 못했습니다.");
  }
  return data.items ?? [];
}

export async function getVaultBundle(): Promise<{
  items: VaultItemMeta[];
  usage: VaultUsage;
}> {
  const res = await fetch("/api/vault", { cache: "no-store" });
  const data = await readJson<{
    ok: boolean;
    items?: VaultItemMeta[];
    usage?: VaultUsage;
    message?: string;
  }>(res);
  if (!res.ok || !data.ok || !data.usage) {
    throw new Error(data.message ?? "보관함을 불러오지 못했습니다.");
  }
  return { items: data.items ?? [], usage: data.usage };
}

export async function getVaultUsage(): Promise<VaultUsage> {
  const { usage } = await getVaultBundle();
  return usage;
}

export async function getVaultItem(id: string): Promise<VaultItem | null> {
  const res = await fetch(`/api/vault/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  const data = await readJson<{
    ok: boolean;
    url?: string;
    name?: string;
    mime?: string;
    size?: number;
    createdAt?: string;
    message?: string;
  }>(res);
  if (!res.ok || !data.ok || !data.url) {
    throw new Error(data.message ?? "파일을 열지 못했습니다.");
  }
  const blobRes = await fetch(data.url);
  if (!blobRes.ok) throw new Error("파일을 내려받지 못했습니다.");
  const blob = await blobRes.blob();
  return {
    id,
    name: data.name ?? "file",
    size: data.size ?? blob.size,
    mime: data.mime || blob.type || "application/octet-stream",
    createdAt: data.createdAt ?? new Date().toISOString(),
    blob,
  };
}

export async function addVaultFile(
  file: File,
  purpose: "VAULT" | "MEETING" = "VAULT",
): Promise<VaultItemMeta> {
  if (file.size > VAULT_MAX_BYTES) {
    throw new Error(
      `파일은 ${formatVaultSize(VAULT_MAX_BYTES)} 이하만 올릴 수 있습니다.`,
    );
  }

  const mime = file.type || "application/octet-stream";
  const presignRes = await fetch("/api/vault/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      mime,
      purpose,
    }),
  });
  const prepared = await readJson<{
    ok: boolean;
    mode?: "local" | "spaces";
    id?: string;
    key?: string;
    uploadUrl?: string | null;
    mime?: string;
    message?: string;
  }>(presignRes);
  if (!presignRes.ok || !prepared.ok || !prepared.id || !prepared.key) {
    throw new Error(prepared.message ?? "업로드 준비에 실패했습니다.");
  }

  const preparedMeta = {
    id: prepared.id,
    key: prepared.key,
    mime: prepared.mime,
  };

  if (prepared.mode === "local" || !prepared.uploadUrl) {
    return uploadViaServer(
      "/api/vault/local",
      file,
      preparedMeta,
      purpose,
      mime,
    );
  }

  const uploadUrl = prepared.uploadUrl;

  // 브라우저 → Spaces 직접 업로드. CORS/Load failed면 서버 경유로 재시도.
  try {
    const putRes = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": preparedMeta.mime || mime,
      },
    });
    if (!putRes.ok) {
      throw new Error(`spaces_put_${putRes.status}`);
    }

    const completeRes = await fetch("/api/vault/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: preparedMeta.id,
        key: preparedMeta.key,
        name: file.name,
        size: file.size,
        mime: preparedMeta.mime || mime,
        purpose,
      }),
    });
    const data = await readJson<{
      ok: boolean;
      item?: VaultItemMeta;
      message?: string;
    }>(completeRes);
    if (!completeRes.ok || !data.ok || !data.item) {
      throw new Error(data.message ?? "업로드 완료 처리에 실패했습니다.");
    }
    notifyVaultChanged();
    return data.item;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const networkFail =
      /load failed|failed to fetch|networkerror|spaces_put_/i.test(msg);
    if (!networkFail) throw err;
    return uploadViaServer(
      "/api/vault/proxy",
      file,
      preparedMeta,
      purpose,
      mime,
    );
  }
}

async function uploadViaServer(
  path: "/api/vault/local" | "/api/vault/proxy",
  file: File,
  prepared: { id: string; key: string; mime?: string },
  purpose: "VAULT" | "MEETING",
  mime: string,
): Promise<VaultItemMeta> {
  const form = new FormData();
  form.set("file", file);
  form.set("id", prepared.id);
  form.set("key", prepared.key);
  form.set("name", file.name);
  form.set("mime", prepared.mime || mime);
  form.set("purpose", purpose);
  const res = await fetch(path, { method: "POST", body: form });
  const data = await readJson<{
    ok: boolean;
    item?: VaultItemMeta;
    message?: string;
  }>(res);
  if (!res.ok || !data.ok || !data.item) {
    throw new Error(data.message ?? "업로드에 실패했습니다.");
  }
  notifyVaultChanged();
  return data.item;
}

export async function removeVaultItem(id: string): Promise<void> {
  const res = await fetch(`/api/vault/${id}`, { method: "DELETE" });
  const data = await readJson<{ ok: boolean; message?: string }>(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.message ?? "삭제에 실패했습니다.");
  }
  notifyVaultChanged();
}

export async function clearVault(): Promise<void> {
  const res = await fetch("/api/vault?all=1", { method: "DELETE" });
  const data = await readJson<{ ok: boolean; message?: string }>(res);
  if (!res.ok || !data.ok) {
    throw new Error(data.message ?? "비우기에 실패했습니다.");
  }
  notifyVaultChanged();
}
