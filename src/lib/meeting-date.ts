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

/** Asia/Seoul 캘린더일 YYYY-MM-DD. */
export function seoulDateKey(input: Date | string | number = new Date()) {
  const date =
    input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "invalid";
  const parts = seoulParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** Asia/Seoul 기준 오늘에서 n일 전 YYYY-MM-DD. */
export function seoulDateKeyDaysAgo(n: number, now: Date = new Date()) {
  const parts = seoulDayOffset(now, -Math.max(0, Math.floor(n)));
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** datetime-local 값용 Asia/Seoul YYYY-MM-DDTHH:mm */
export function toSeoulDateTimeLocal(dateString: string) {
  const date = parseMeetingDate(dateString);
  if (Number.isNaN(date.getTime())) return "";
  const p = seoulParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * datetime-local(서울 벽시계) → UTC ISO.
 * 한국은 DST 없음, +09:00 고정.
 */
export function fromSeoulDateTimeLocal(local: string): string | null {
  const m = local
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
    );
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}+09:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** 회의 date 필드 검증. ISO 또는 서울 로컬 문자열. */
export function normalizeMeetingDateIso(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const fromLocal = fromSeoulDateTimeLocal(t);
  if (fromLocal) return fromLocal;
  const d = parseMeetingDate(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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

const WEEKDAY_SHORT = ["일", "월", "화", "수", "목", "금", "토"] as const;
const WEEKDAY_FULL = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
] as const;

export type UpcomingDayOption = {
  offset: number;
  label: string;
  weekdayShort: string;
  day: number;
  month: number;
  iso: string;
};

function seoulDayOffset(now: Date, offset: number) {
  const parts = seoulParts(now);
  const base = toUtcDay(parts.year, parts.month, parts.day);
  return fromUtcDay(base + offset * 24 * 60 * 60 * 1000);
}

/** 예정 회의용 날짜 라벨 (오늘/내일/모레, 일주일 안은 요일, 그 외는 M월 D일). */
export function formatUpcomingDateLabel(
  offset: number,
  now: Date = new Date(),
): string {
  if (offset === 0) return "오늘";
  if (offset === 1) return "내일";
  if (offset === 2) return "모레";

  const parts = seoulDayOffset(now, offset);
  const weekday = new Date(
    toUtcDay(parts.year, parts.month, parts.day),
  ).getUTCDay();

  if (offset >= 3 && offset <= 6) {
    return WEEKDAY_FULL[weekday] ?? `${parts.month}월 ${parts.day}일`;
  }

  return `${parts.month}월 ${parts.day}일`;
}

/** 앞으로 N일 선택 옵션 (오늘 포함). */
export function listUpcomingDays(
  count = 14,
  now: Date = new Date(),
): UpcomingDayOption[] {
  return Array.from({ length: count }, (_, offset) => {
    const parts = seoulDayOffset(now, offset);
    const weekday = new Date(
      toUtcDay(parts.year, parts.month, parts.day),
    ).getUTCDay();
    return {
      offset,
      label: formatUpcomingDateLabel(offset, now),
      weekdayShort: WEEKDAY_SHORT[weekday] ?? "",
      day: parts.day,
      month: parts.month,
      iso: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    };
  });
}

export type MonthDayCell = {
  iso: string;
  day: number;
  inMonth: boolean;
};

/** YYYY-MM-DD → { year, month, day } */
export function parseIsoDateParts(iso: string) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
  };
}

/** M3 월 달력용 그리드 (일요일 시작, 6주). month는 1–12. */
export function listMonthDayCells(
  year: number,
  month: number,
): MonthDayCell[] {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevDays = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const cells: MonthDayCell[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    const day = prevDays - firstWeekday + 1 + i;
    cells.push({
      iso: `${prevYear}-${pad(prevMonth)}-${pad(day)}`,
      day,
      inMonth: false,
    });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      iso: `${year}-${pad(month)}-${pad(day)}`,
      day,
      inMonth: true,
    });
  }
  let nextDay = 1;
  while (cells.length < 42) {
    cells.push({
      iso: `${nextYear}-${pad(nextMonth)}-${pad(nextDay)}`,
      day: nextDay,
      inMonth: false,
    });
    nextDay += 1;
  }
  return cells;
}

export function shiftMonth(year: number, month: number, delta: number) {
  const idx = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(idx / 12),
    month: (idx % 12) + 1,
  };
}

/** dateLabel → YYYY-MM-DD (서울 기준). 파싱 실패 시 null. */
export function dateLabelToIso(
  dateLabel: string,
  now: Date = new Date(),
): string | null {
  const days = daysUntilFromDateLabel(dateLabel, now);
  if (days === null) return null;
  const parts = seoulDayOffset(now, days);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

/** YYYY-MM-DD → 예정 회의 dateLabel. */
export function isoToUpcomingDateLabel(
  iso: string,
  now: Date = new Date(),
): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return formatUpcomingDateLabel(0, now);

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const parts = seoulParts(now);
  const todayMs = toUtcDay(parts.year, parts.month, parts.day);
  const targetMs = toUtcDay(year, month, day);
  const offset = Math.round((targetMs - todayMs) / (24 * 60 * 60 * 1000));
  if (offset < 0) return `${month}월 ${day}일`;
  return formatUpcomingDateLabel(offset, now);
}

/**
 * dateLabel → 확정 일정용 절대 날짜 표기.
 * 예: 7월 23일 (목). 올해가 아니면 연도 포함.
 */
export function formatUpcomingAbsoluteDate(
  dateLabel: string,
  now: Date = new Date(),
): string | null {
  const iso = dateLabelToIso(dateLabel, now);
  if (!iso) return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const weekday = new Date(toUtcDay(year, month, day)).getUTCDay();
  const weekdayShort = WEEKDAY_SHORT[weekday] ?? "";
  const nowParts = seoulParts(now);
  if (year !== nowParts.year) {
    return `${year}년 ${month}월 ${day}일 (${weekdayShort})`;
  }
  return `${month}월 ${day}일 (${weekdayShort})`;
}

/** 오늘/내일/모레만. 확정 일정의 보조 힌트용. */
export function relativeUpcomingHint(
  dateLabel: string,
  now: Date = new Date(),
): string | null {
  const days = daysUntilFromDateLabel(dateLabel, now);
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  if (days === 2) return "모레";
  return null;
}

/**
 * 확정 일정 요약. 예: 7월 23일 (목) 16:00, 소요 30분
 * dateLabel 저장값은 상대표기여도 표시는 항상 절대.
 */
export function formatUpcomingScheduleSummary(
  dateLabel: string,
  timeLabel: string,
  duration: string,
  now: Date = new Date(),
): string {
  const datePart = formatUpcomingAbsoluteDate(dateLabel, now) ?? dateLabel.trim();
  const time = timeLabel.trim() || "--:--";
  const dur = duration.trim();
  if (dur) return `${datePart} ${time}, 소요 ${dur}`;
  return `${datePart} ${time}`;
}

/** 예정 회의 dateLabel → 오늘부터 남은 일수 (오늘=0). Asia/Seoul 기준. */
export function daysUntilFromDateLabel(
  dateLabel: string,
  now: Date = new Date(),
): number | null {
  const label = dateLabel.trim();
  if (!label) return null;
  if (label === "오늘") return 0;
  if (label === "내일") return 1;
  if (label === "모레") return 2;

  const monthDay = label.match(/^(\d{1,2})월\s*(\d{1,2})일$/);
  if (monthDay) {
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    const parts = seoulParts(now);
    let year = parts.year;
    let targetMs = toUtcDay(year, month, day);
    const todayMs = toUtcDay(parts.year, parts.month, parts.day);
    if (targetMs < todayMs) {
      year += 1;
      targetMs = toUtcDay(year, month, day);
    }
    return Math.round((targetMs - todayMs) / (24 * 60 * 60 * 1000));
  }

  const target = WEEKDAY_KO[label];
  if (target === undefined) return null;

  const parts = seoulParts(now);
  const todayMs = toUtcDay(parts.year, parts.month, parts.day);
  const todayWeekday = new Date(todayMs).getUTCDay();
  let delta = target - todayWeekday;
  if (delta < 0) delta += 7;
  return delta;
}

/** 예: 오늘, 내일, D-2 … D-9. 0~9일만, 그 외·파싱 불가면 null. */
export function formatDdayLabel(
  dateLabel: string,
  now: Date = new Date(),
): string | null {
  const days = daysUntilFromDateLabel(dateLabel, now);
  if (days === null || days < 0 || days > 9) return null;
  if (days === 0) return "오늘";
  if (days === 1) return "내일";
  return `D-${days}`;
}

/**
 * 예정 목록/카드용 날짜 표기.
 * 저장값이 "금요일"/"내일"처럼 달라도 같은 날은 같은 라벨로 맞춤.
 * 배지는 D-N만 (오늘/내일/모레는 본문에 이미 포함).
 */
export function resolveUpcomingListDate(
  dateLabel: string,
  now: Date = new Date(),
): { label: string; ddayBadge: string | null; days: number | null } {
  const days = daysUntilFromDateLabel(dateLabel, now);
  const label =
    days !== null ? formatUpcomingDateLabel(days, now) : dateLabel.trim();
  const dday = formatDdayLabel(dateLabel, now);
  const ddayBadge = dday && dday.startsWith("D-") ? dday : null;
  return { label, ddayBadge, days };
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

/**
 * 기록 목록 날짜 그룹 헤더.
 * 오늘·어제·내일은 상대만 쓰고, 그 외는 `8월 3일 (월)`.
 */
export function formatRecordsDayParts(
  dateString: string,
  now: Date = new Date(),
): { relative: string | null; absolute: string } {
  const parts = seoulParts(new Date(dateString));
  const weekday = new Date(
    toUtcDay(parts.year, parts.month, parts.day),
  ).getUTCDay();
  const weekdayShort = WEEKDAY_SHORT[weekday] ?? "";
  const absolute = `${parts.month}월 ${parts.day}일 (${weekdayShort})`;

  const days = getCalendarDaysAgo(dateString, now);
  if (days === 0) return { relative: "오늘", absolute };
  if (days === 1) return { relative: "어제", absolute };
  if (days === -1) return { relative: "내일", absolute };
  return { relative: null, absolute };
}

/** @deprecated formatRecordsDayParts 사용 */
export function formatRecordsDayLabel(
  dateString: string,
  now: Date = new Date(),
): string {
  const { relative, absolute } = formatRecordsDayParts(dateString, now);
  return relative ?? absolute;
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

/** 회의 상세 메타: 2026.07.22 (수), 오전 11:33 */
export function formatSeoulDateParts(dateString: string) {
  const date = parseMeetingDate(dateString);
  const parts = seoulParts(date);
  const weekday = new Date(
    toUtcDay(parts.year, parts.month, parts.day),
  ).getUTCDay();
  const weekdayShort = WEEKDAY_SHORT[weekday] ?? "";

  const day = `${parts.year}.${pad(parts.month)}.${pad(parts.day)} (${weekdayShort})`;

  const period = parts.hour < 12 ? "오전" : "오후";
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  const time = `${period} ${hour12}:${pad(parts.minute)}`;

  return { day, time, iso: date.toISOString() };
}

/** 리스트 leading용 짧은 날짜 + 시간 (M3 list leading / overline 관례). */
export function formatSeoulListLeading(dateString: string) {
  const date = parseMeetingDate(dateString);
  const day = new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL,
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("ko-KR", {
    timeZone: SEOUL,
    hour: "numeric",
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

/** YYYY-MM-DD → 2026.08.03 */
export function formatDottedDate(iso: string): string {
  const parts = parseIsoDateParts(iso);
  if (!parts) return iso;
  return `${parts.year}.${pad(parts.month)}.${pad(parts.day)}`;
}

/** 2026.08.03 / 2026-08-03 / 20260803 → YYYY-MM-DD */
export function parseFlexibleDateInput(raw: string): string | null {
  const trimmed = raw.trim();
  const dotted = trimmed.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (dotted) {
    const year = Number(dotted[1]);
    const month = Number(dotted[2]);
    const day = Number(dotted[3]);
    if (!isValidYmd(year, month, day)) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }
  const compact = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) {
    const year = Number(compact[1]);
    const month = Number(compact[2]);
    const day = Number(compact[3]);
    if (!isValidYmd(year, month, day)) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }
  return null;
}

function isValidYmd(year: number, month: number, day: number) {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const ms = toUtcDay(year, month, day);
  const back = fromUtcDay(ms);
  return back.year === year && back.month === month && back.day === day;
}

export function defaultRecordsRange(now = new Date()): {
  fromIso: string;
  toIso: string;
} {
  const { startMs, endMs } = getPeriodRange(now, "week");
  return {
    fromIso: isoFromUtcDayMs(startMs),
    toIso: isoFromUtcDayMs(endMs),
  };
}

function isoFromUtcDayMs(ms: number): string {
  const day = fromUtcDay(ms);
  return `${day.year}-${pad(day.month)}-${pad(day.day)}`;
}

/** 기록 기간 빠른 선택. */
export function recordsQuickRanges(now = new Date()): {
  today: { fromIso: string; toIso: string };
  week: { fromIso: string; toIso: string };
  month: { fromIso: string; toIso: string };
} {
  const today = seoulDateKey(now);
  const week = getPeriodRange(now, "week");
  const month = getPeriodRange(now, "month");
  return {
    today: { fromIso: today, toIso: today },
    week: {
      fromIso: isoFromUtcDayMs(week.startMs),
      toIso: isoFromUtcDayMs(week.endMs),
    },
    month: {
      fromIso: isoFromUtcDayMs(month.startMs),
      toIso: isoFromUtcDayMs(month.endMs),
    },
  };
}

/** 기록 헤더용 구간 라벨 (주간/월간 단위 문구 없음). */
export function formatRecordsRangeLabel(fromIso: string, toIso: string): string {
  const start = parseIsoDateParts(fromIso);
  const end = parseIsoDateParts(toIso);
  if (!start || !end) return `${fromIso} – ${toIso}`;
  if (start.year === end.year && start.month === end.month) {
    if (start.day === end.day) {
      return `${start.year}년 ${start.month}월 ${start.day}일`;
    }
    return `${start.year}년 ${start.month}월 ${start.day}일 – ${end.day}일`;
  }
  if (start.year === end.year) {
    return `${start.year}년 ${start.month}월 ${start.day}일 – ${end.month}월 ${end.day}일`;
  }
  return `${start.year}년 ${start.month}월 ${start.day}일 – ${end.year}년 ${end.month}월 ${end.day}일`;
}

/** 모바일 헤더·입력용: 2026.08.03 ~ 2026.08.09 */
export function formatDottedRangeLabel(fromIso: string, toIso: string): string {
  return `${formatDottedDate(fromIso)} ~ ${formatDottedDate(toIso)}`;
}

export function isMeetingInDateRange(
  dateString: string,
  fromIso: string,
  toIso: string,
): boolean {
  const from = parseIsoDateParts(fromIso);
  const to = parseIsoDateParts(toIso);
  if (!from || !to) return false;
  const startMs = toUtcDay(from.year, from.month, from.day);
  const endMs = toUtcDay(to.year, to.month, to.day);
  const low = Math.min(startMs, endMs);
  const high = Math.max(startMs, endMs);
  const parts = seoulParts(parseMeetingDate(dateString));
  const dayMs = toUtcDay(parts.year, parts.month, parts.day);
  return dayMs >= low && dayMs <= high;
}

/** 현재 구간 길이만큼 앞·뒤로 민다. */
export function shiftDateRange(
  fromIso: string,
  toIso: string,
  delta: number,
): { fromIso: string; toIso: string } {
  const from = parseIsoDateParts(fromIso);
  const to = parseIsoDateParts(toIso);
  if (!from || !to) return { fromIso, toIso };
  const startMs = toUtcDay(from.year, from.month, from.day);
  const endMs = toUtcDay(to.year, to.month, to.day);
  const low = Math.min(startMs, endMs);
  const high = Math.max(startMs, endMs);
  const spanDays = Math.round((high - low) / 86400000) + 1;
  const offset = delta * spanDays * 86400000;
  const nextStart = fromUtcDay(low + offset);
  const nextEnd = fromUtcDay(high + offset);
  return {
    fromIso: `${nextStart.year}-${pad(nextStart.month)}-${pad(nextStart.day)}`,
    toIso: `${nextEnd.year}-${pad(nextEnd.month)}-${pad(nextEnd.day)}`,
  };
}

export function normalizeDateRange(
  fromIso: string,
  toIso: string,
): { fromIso: string; toIso: string } {
  if (fromIso <= toIso) return { fromIso, toIso };
  return { fromIso: toIso, toIso: fromIso };
}
