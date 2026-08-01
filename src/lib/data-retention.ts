/** 제품 데이터 보관·표시 기간. UI·스토어·알림이 동일 규칙을 씀. */

export const DATA_RETENTION_OPTIONS = [30, 60, 90, 365] as const;
export type DataRetentionDays = (typeof DATA_RETENTION_OPTIONS)[number];

export const DEFAULT_DATA_RETENTION_DAYS: DataRetentionDays = 90;

/** 확인(읽음) 알림을 최근 내역에 보여주는 일수. DB 삭제가 아님. */
export const NOTIFICATION_RECENT_DISPLAY_DAYS = 7;

/**
 * 팀 감사 로그(접속기록) 서버 보관 일수. 조회·퍼지 시 적용.
 * 사용자가 줄일 수 없다 — "개인정보의 안전성 확보조치 기준" 제8조
 * (접속기록의 보관 및 점검). 기본 법정 최소는 1년이나, Faith는 회의 내용에
 * 고유식별·민감정보가 포함될 수 있는 처리 특성을 고려해 고시 상한 구간인
 * 최소 2년(730일)을 제품 고정값으로 둔다. 일반 데이터(회의 기록, 알림)
 * 보존 기간은 이 조항의 대상이 아니며 사용자가 선택한다(DATA_RETENTION_OPTIONS).
 */
export const TEAM_AUDIT_RETENTION_DAYS = 730;

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
  if (DATA_RETENTION_OPTIONS.includes(n as DataRetentionDays)) {
    return n as DataRetentionDays;
  }
  return DEFAULT_DATA_RETENTION_DAYS;
}

/**
 * 서버(DB)가 SSOT. UI는 /api/account/data-retention 값을 쓴다.
 * localStorage는 구 클라이언트·오프라인 캐시 호환용이며 권한·삭제의 근거가 아니다.
 */
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

/** 설정 저장 성공 시 구 클라이언트와 맞추기 위해 미러만 한다. 읽기 SSOT는 DB. */
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
