/** 개발용 파일 보관함. IndexedDB에 저장해 첨부 UI 어디서든 재사용. */

export const VAULT_CHANGED_EVENT = "faith.vault.changed";
export const VAULT_MAX_BYTES = 40 * 1024 * 1024;

export type VaultItemMeta = {
  id: string;
  name: string;
  size: number;
  mime: string;
  createdAt: string;
};

export type VaultItem = VaultItemMeta & {
  blob: Blob;
};

const DB_NAME = "faith-vault";
const DB_VERSION = 1;
const STORE = "files";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("vault db open failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("vault tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("vault tx aborted"));
  });
}

export function formatVaultSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function notifyVaultChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(VAULT_CHANGED_EVENT));
}

export async function listVaultItems(): Promise<VaultItemMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result as VaultItem[]).map(
        ({ id, name, size, mime, createdAt }) => ({
          id,
          name,
          size,
          mime,
          createdAt,
        }),
      );
      rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      resolve(rows);
    };
    req.onerror = () => reject(req.error ?? new Error("vault list failed"));
  });
}

export async function getVaultItem(id: string): Promise<VaultItem | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as VaultItem | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("vault get failed"));
  });
}

export async function addVaultFile(file: File): Promise<VaultItemMeta> {
  if (file.size > VAULT_MAX_BYTES) {
    throw new Error(`파일은 ${formatVaultSize(VAULT_MAX_BYTES)} 이하만 넣을 수 있습니다.`);
  }
  const item: VaultItem = {
    id: `vault-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    size: file.size,
    mime: file.type || "application/octet-stream",
    createdAt: new Date().toISOString(),
    blob: file,
  };
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(item);
  await txDone(tx);
  notifyVaultChanged();
  const { blob: _blob, ...meta } = item;
  return meta;
}

export async function removeVaultItem(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(id);
  await txDone(tx);
  notifyVaultChanged();
}

export async function clearVault(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).clear();
  await txDone(tx);
  notifyVaultChanged();
}
