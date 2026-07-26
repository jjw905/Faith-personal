/** 제품 데이터 보관·표시 기간. UI·스토어·알림이 동일 규칙을 씀. */

export const DATA_RETENTION_OPTIONS = [30, 60, 90] as const;
export type DataRetentionDays = (typeof DATA_RETENTION_OPTIONS)[number];

export const DEFAULT_DATA_RETENTION_DAYS: DataRetentionDays = 90;

/** 확인(읽음) 알림을 최근 내역에 보여주는 일수. DB 삭제가 아님. */
export const NOTIFICATION_RECENT_DISPLAY_DAYS = 7;

/** 팀 감사 로그 서버 보관 일수. 조회·퍼지 시 적용. */
export const TEAM_AUDIT_RETENTION_DAYS = 365;

/**
 * Soft-delete / trash for team meetings is not modeled (`deletedAt` absent).
 * Policy intent is 7 days once a trash lifecycle exists. Do not expose
 * automatic trash deletion until storage supports it.
 */
export const TEAM_TRASH_RETENTION_SUPPORTED = false;
export const TEAM_TRASH_RETENTION_DAYS_POLICY = 7;

/** 클라이언트·서버 공통 설정 키 (회의록·알림 등 데이터 보존). */
export const DATA_RETENTION_STORAGE_KEY = "faith.settings.dataRetentionDays";

export function parseDataRetentionDays(
  raw: string | number | null | undefined,
): DataRetentionDays {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (n === 30 || n === 60 || n === 90) return n;
  return DEFAULT_DATA_RETENTION_DAYS;
}

export function readDataRetentionDaysFromStorage(): DataRetentionDays {
  if (typeof window === "undefined") return DEFAULT_DATA_RETENTION_DAYS;
  try {
    return parseDataRetentionDays(
      window.localStorage.getItem(DATA_RETENTION_STORAGE_KEY),
    );
  } catch {
    return DEFAULT_DATA_RETENTION_DAYS;
  }
}

export function writeDataRetentionDaysToStorage(days: DataRetentionDays) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DATA_RETENTION_STORAGE_KEY, String(days));
  } catch {
    // ignore
  }
}

export function daysBetween(fromIso: string, to: Date = new Date()): number {
  const from = new Date(fromIso).getTime();
  if (Number.isNaN(from)) return Number.POSITIVE_INFINITY;
  return (to.getTime() - from) / (24 * 60 * 60 * 1000);
}

/** 기준 시각으로부터 days 이내이면 true (표시용). */
export function isWithinRetentionDays(
  iso: string,
  days: number,
  now: Date = new Date(),
): boolean {
  const age = daysBetween(iso, now);
  return age >= 0 && age <= days;
}

/** 보존 기간이 지나 하드 삭제 대상. */
export function isPastDataRetention(
  iso: string,
  retentionDays: number,
  now: Date = new Date(),
): boolean {
  return daysBetween(iso, now) > retentionDays;
}
