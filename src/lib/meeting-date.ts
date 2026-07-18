const SEOUL = "Asia/Seoul";

function seoulParts(date: Date) {
  const map = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: SEOUL,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Asia/Seoul 기준 YYYY-MM-DDTHH:mm:ss (오프셋 없는 로컬 시각 문자열). */
function seoulLocalIso(parts: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function toUtcDay(year: number, month: number, day: number) {
  return Date.UTC(year, month - 1, day);
}

function fromUtcDay(ms: number) {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function parseMeetingDate(dateString: string) {
  return new Date(
    /[zZ]|[+-]\d{2}:\d{2}$/.test(dateString)
      ? dateString
      : `${dateString}+09:00`,
  );
}

/** 캘린더 일 기준 경과 일수 (오늘=0, 어제=1). Asia/Seoul 기준. */
export function getCalendarDaysAgo(
  dateString: string,
  now: Date = new Date(),
): number {
  const target = seoulParts(new Date(dateString));
  const current = seoulParts(now);
  const t = toUtcDay(target.year, target.month, target.day);
  const n = toUtcDay(current.year, current.month, current.day);
  return Math.round((n - t) / (24 * 60 * 60 * 1000));
}

const WEEKDAY_KO: Record<string, number> = {
  일요일: 0,
  월요일: 1,
  화요일: 2,
  수요일: 3,
  목요일: 4,
  금요일: 5,
  토요일: 6,
};

/** 예정 회의 dateLabel → 오늘부터 남은 일수 (오늘=0). Asia/Seoul 기준. */
export function daysUntilFromDateLabel(
  dateLabel: string,
  now: Date = new Date(),
): number | null {
  const label = dateLabel.trim();
  if (label === "오늘") return 0;
  if (label === "내일") return 1;

  const target = WEEKDAY_KO[label];
  if (target === undefined) return null;

  const parts = seoulParts(now);
  const todayMs = toUtcDay(parts.year, parts.month, parts.day);
  const todayWeekday = new Date(todayMs).getUTCDay();
  let delta = target - todayWeekday;
  if (delta < 0) delta += 7;
  return delta;
}

/** 예: D-Day, D-1 … D-9. 0~9일만, 그 외·파싱 불가면 null. */
export function formatDdayLabel(
  dateLabel: string,
  now: Date = new Date(),
): string | null {
  const days = daysUntilFromDateLabel(dateLabel, now);
  if (days === null || days < 0 || days > 9) return null;
  if (days === 0) return "D-Day";
  return `D-${days}`;
}

/**
 * 7일 이내(오늘 포함)면 "오늘" / "N일전", 그 외·미래는 null.
 * 회의 기록 목록에서 동적으로 계산합니다.
 */
export function formatRecentDaysLabel(
  dateString: string,
  now: Date = new Date(),
): string | null {
  const days = getCalendarDaysAgo(dateString, now);
  if (days < 0 || days > 7) return null;
  if (days === 0) return "오늘";
  return `${days}일전`;
}

/** mock의 daysAgo 기준으로 오늘(서울) 기준 실제 datetime 문자열 생성. */
export function resolveDateFromDaysAgo(
  daysAgo: number,
  timeHHmmss: string,
  now: Date = new Date(),
): string {
  const [hh = 12, mm = 0, ss = 0] = timeHHmmss.split(":").map((v) => Number(v));
  const { year, month, day } = seoulParts(now);
  const anchorMs = toUtcDay(year, month, day) - daysAgo * 86400000;
  const anchor = fromUtcDay(anchorMs);
  return seoulLocalIso({
    year: anchor.year,
    month: anchor.month,
    day: anchor.day,
    hour: hh,
    minute: mm,
    second: ss,
  });
}

export function formatSeoulDateParts(dateString: string) {
  const date = parseMeetingDate(dateString);
  const day = new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  return { day, time };
}

export type PeriodUnit = "week" | "month" | "year";

export type PeriodRange = {
  startMs: number;
  endMs: number;
  label: string;
};

/** 월요일 시작 주간 (Asia/Seoul 캘린더). */
function weekBounds(parts: { year: number; month: number; day: number }) {
  const ms = toUtcDay(parts.year, parts.month, parts.day);
  const weekday = new Date(ms).getUTCDay(); // 0=Sun
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const startMs = ms + mondayOffset * 86400000;
  const endMs = startMs + 6 * 86400000;
  return { startMs, endMs };
}

export function getPeriodRange(
  anchor: Date = new Date(),
  unit: PeriodUnit = "week",
): PeriodRange {
  const parts = seoulParts(anchor);

  if (unit === "week") {
    const { startMs, endMs } = weekBounds(parts);
    const start = fromUtcDay(startMs);
    const end = fromUtcDay(endMs);
    const sameMonth = start.month === end.month && start.year === end.year;
    const label = sameMonth
      ? `${start.year}년 ${start.month}월 ${start.day}일 – ${end.day}일`
      : `${start.year}년 ${start.month}월 ${start.day}일 – ${end.month}월 ${end.day}일`;
    return { startMs, endMs, label };
  }

  if (unit === "month") {
    const startMs = toUtcDay(parts.year, parts.month, 1);
    const endMs = toUtcDay(parts.year, parts.month + 1, 0);
    return {
      startMs,
      endMs,
      label: `${parts.year}년 ${parts.month}월`,
    };
  }

  const startMs = toUtcDay(parts.year, 1, 1);
  const endMs = toUtcDay(parts.year, 12, 31);
  return {
    startMs,
    endMs,
    label: `${parts.year}년`,
  };
}

export function shiftPeriodAnchor(
  anchor: Date,
  unit: PeriodUnit,
  delta: number,
): Date {
  const parts = seoulParts(anchor);

  if (unit === "week") {
    const ms =
      toUtcDay(parts.year, parts.month, parts.day) + delta * 7 * 86400000;
    const next = fromUtcDay(ms);
    return new Date(
      `${next.year}-${pad(next.month)}-${pad(next.day)}T12:00:00+09:00`,
    );
  }

  if (unit === "month") {
    const idx = parts.year * 12 + (parts.month - 1) + delta;
    const year = Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    const day = Math.min(parts.day, 28);
    return new Date(`${year}-${pad(month)}-${pad(day)}T12:00:00+09:00`);
  }

  return new Date(
    `${parts.year + delta}-${pad(parts.month)}-${pad(parts.day)}T12:00:00+09:00`,
  );
}

export function isMeetingInPeriod(
  dateString: string,
  anchor: Date,
  unit: PeriodUnit,
): boolean {
  const { startMs, endMs } = getPeriodRange(anchor, unit);
  const parts = seoulParts(parseMeetingDate(dateString));
  const dayMs = toUtcDay(parts.year, parts.month, parts.day);
  return dayMs >= startMs && dayMs <= endMs;
}

export function isCurrentPeriod(
  anchor: Date,
  unit: PeriodUnit,
  now = new Date(),
) {
  const a = getPeriodRange(anchor, unit);
  const b = getPeriodRange(now, unit);
  return a.startMs === b.startMs && a.endMs === b.endMs;
}
