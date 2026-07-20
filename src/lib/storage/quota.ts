/** 유저당 스토리지 한도 500MB */
export const STORAGE_QUOTA_BYTES = 500 * 1024 * 1024;

/** 단일 파일 최대 100MB */
export const STORAGE_MAX_FILE_BYTES = 100 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
