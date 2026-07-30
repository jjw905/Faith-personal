"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ChevronDown,
  Gauge,
  LoaderCircle,
  RefreshCw,
  Users,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  fixtureAiUsageEmpty,
  fixtureAiUsageFull,
} from "@/lib/page-ux-fixtures";
import { seoulDateKey, seoulDateKeyDaysAgo } from "@/lib/meeting-date";
import type { AiUsageSummary } from "@/lib/stt/usage-store";
import { cn } from "@/lib/utils";

const CARD_SHADOW =
  "rounded-3xl shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border";

/** Faith tokens only (primary / success / muted). */
const COLORS = {
  stt: "var(--primary)",
  structure: "var(--success)",
  tokensIn: "var(--muted)",
  tokensOut: "var(--muted-2)",
};

export type AiUsageUserOption = {
  id: string;
  label: string;
  usd: number;
  krw: number;
  jobs: number;
};

type RangeKey = "today" | "7d" | "30d" | "90d" | "all" | "custom";

function formatUsd(n: number) {
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatKrw(n: number) {
  const won = Math.round(n);
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(won);
}

function formatRate(n: number) {
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 2,
  }).format(n);
}

function MoneyText({
  krw,
  usd,
  align = "end",
  size = "md",
}: {
  krw: number;
  usd: number;
  align?: "start" | "end";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-col tabular-nums",
        align === "end" ? "items-end" : "items-start",
      )}
    >
      <span
        className={cn(
          "font-semibold text-foreground",
          size === "lg" && "text-2xl tracking-tight",
          size === "md" && "text-base",
          size === "sm" && "text-base",
        )}
      >
        {formatKrw(krw)}
      </span>
      <span className="text-base font-medium text-muted">{formatUsd(usd)}</span>
    </span>
  );
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatShortDate(isoDate: string) {
  const [, m, d] = isoDate.split("-");
  return `${Number(m)}/${Number(d)}`;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function todayKey() {
  return seoulDateKey();
}

function daysAgoKey(n: number) {
  return seoulDateKeyDaysAgo(n);
}

function rangeToBounds(
  range: RangeKey,
  customFrom: string,
  customTo: string,
): { from: string | null; to: string | null } {
  const today = todayKey();
  if (range === "today") return { from: today, to: today };
  if (range === "7d") return { from: daysAgoKey(6), to: today };
  if (range === "30d") return { from: daysAgoKey(29), to: today };
  if (range === "90d") return { from: daysAgoKey(89), to: today };
  if (range === "all") return { from: null, to: null };
  return {
    from: customFrom || null,
    to: customTo || null,
  };
}

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "오늘" },
  { key: "7d", label: "7일" },
  { key: "30d", label: "30일" },
  { key: "90d", label: "90일" },
  { key: "all", label: "전체" },
  { key: "custom", label: "직접" },
];

/** Client-side page sizes for long lists (filters still refetch full summary). */
const PAGE_USERS = 10;
const PAGE_DAYS = 14;
const PAGE_MODELS = 10;
const PAGE_RECENT = 15;

const UX_USER_LABELS: Record<string, string> = {
  "ux-user-1": "김서연",
  "ux-user-2": "최민준",
  "ux-user-3": "이준호",
  "ux-user-4": "박지혜",
  "ux-user-5": "정우진",
  "ux-user-6": "한소희",
  "ux-user-7": "오세훈",
  "ux-user-8": "윤아름",
  "ux-user-9": "강태영",
  "ux-user-10": "문채원",
  "ux-user-11": "신동혁",
  "ux-user-12": "배유진",
  "ux-user-13": "조현우",
  "ux-user-14": "서민지",
};

function useListPage(pageSize: number, resetKey: string) {
  const [visible, setVisible] = useState(pageSize);
  useEffect(() => {
    setVisible(pageSize);
  }, [resetKey, pageSize]);
  return {
    visible,
    showMore: (total: number) =>
      setVisible((v) => Math.min(v + pageSize, total)),
    collapse: () => setVisible(pageSize),
  };
}

function ListPager({
  total,
  visible,
  pageSize,
  onMore,
  onCollapse,
  emptyLabel = "표시할 항목이 없습니다",
}: {
  total: number;
  visible: number;
  pageSize: number;
  onMore: () => void;
  onCollapse: () => void;
  emptyLabel?: string;
}) {
  if (total === 0) {
    return (
      <p className="mt-3 border-t border-border pt-3 text-center text-base text-muted">
        {emptyLabel}
      </p>
    );
  }
  if (total <= pageSize) return null;

  const shown = Math.min(visible, total);
  const hasMore = shown < total;
  const remaining = total - shown;
  const expanded = visible > pageSize;

  return (
    <div className="mt-3 flex flex-col items-stretch gap-2 border-t border-border pt-3 sm:items-center">
      <p className="text-center text-base text-muted">
        {shown} / {total}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {hasMore ? (
          <button
            type="button"
            onClick={onMore}
            className="inline-flex h-12 min-w-12 items-center justify-center rounded-full border border-border-strong bg-surface px-5 text-base font-semibold text-foreground transition-colors hover:bg-surface-2"
          >
            더 보기 ({remaining})
          </button>
        ) : (
          <p className="self-center text-base text-muted">모두 표시됨</p>
        )}
        {expanded ? (
          <button
            type="button"
            onClick={onCollapse}
            className="inline-flex h-12 min-w-12 items-center justify-center rounded-full border border-border px-5 text-base font-semibold text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            접기
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AiUsageDashboard({
  initial,
  initialUsers = [],
}: {
  initial: AiUsageSummary;
  initialUsers?: AiUsageUserOption[];
}) {
  const { scenarioId } = usePageUxPreview();
  const [summary, setSummary] = useState(initial);
  const [users, setUsers] = useState(initialUsers);
  const [range, setRange] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState(daysAgoKey(29));
  const [customTo, setCustomTo] = useState(todayKey());
  const [userId, setUserId] = useState("all");
  const [loading, setLoading] = useState(false);

  const bounds = useMemo(
    () => rangeToBounds(range, customFrom, customTo),
    [range, customFrom, customTo],
  );

  const listResetKey = `${scenarioId}|${range}|${userId}|${bounds.from ?? ""}|${bounds.to ?? ""}`;
  const usersPage = useListPage(PAGE_USERS, listResetKey);
  const daysCostPage = useListPage(PAGE_DAYS, listResetKey);
  const daysTokenPage = useListPage(PAGE_DAYS, listResetKey);
  const modelsPage = useListPage(PAGE_MODELS, listResetKey);
  const recentPage = useListPage(PAGE_RECENT, listResetKey);

  const refresh = useCallback(async () => {
    if (scenarioId !== "live") return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (userId !== "all") q.set("userId", userId);
      if (bounds.from) q.set("from", bounds.from);
      if (bounds.to) q.set("to", bounds.to);
      const res = await fetch(`/api/admin/ai-usage?${q.toString()}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        summary?: AiUsageSummary;
        users?: AiUsageUserOption[];
      };
      if (data.ok && data.summary) setSummary(data.summary);
      if (data.ok && Array.isArray(data.users)) setUsers(data.users);
    } finally {
      setLoading(false);
    }
  }, [userId, bounds.from, bounds.to, scenarioId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (scenarioId !== "live") return;
    const id = window.setInterval(() => {
      void refresh();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [refresh, scenarioId]);

  const viewSummary = useMemo(
    () =>
      scenarioId === "empty"
        ? fixtureAiUsageEmpty()
        : scenarioId === "full"
          ? fixtureAiUsageFull()
          : summary,
    [scenarioId, summary],
  );
  const viewUsers = useMemo(
    () =>
      scenarioId === "empty"
        ? []
        : scenarioId === "full"
          ? viewSummary.byUser.map((u) => ({
              id: u.userId,
              label: UX_USER_LABELS[u.userId] || u.userId,
              usd: u.usd,
              krw: u.krw,
              jobs: u.jobs,
            }))
          : users,
    [scenarioId, viewSummary.byUser, users],
  );

  if (scenarioId === "loading") {
    return (
      <div className={cn("grid min-h-56 place-items-center bg-card", CARD_SHADOW)}>
        <LoaderCircle
          className="h-6 w-6 animate-spin text-muted"
          aria-label="불러오는 중"
        />
      </div>
    );
  }

  const maxDayKrw = Math.max(
    ...viewSummary.byDay.map((d) => d.totalKrw || d.totalUsd),
    0.000001,
  );
  const maxDayTokens = Math.max(
    ...viewSummary.byDay.map((d) => d.totalTokens),
    1,
  );
  const pieTotal =
    (viewSummary.sttKrw || viewSummary.sttUsd) +
    (viewSummary.structureKrw || viewSummary.structureUsd);
  const empty = viewSummary.eventCount === 0;
  const showUserList = userId === "all" && viewSummary.byUser.length > 0;
  const userLabel = (id: string) =>
    viewUsers.find((u) => u.id === id)?.label ||
    UX_USER_LABELS[id] ||
    id;
  const fx = viewSummary.fx;
  const visibleUsers = viewSummary.byUser.slice(0, usersPage.visible);
  const visibleDaysCost = viewSummary.byDay.slice(0, daysCostPage.visible);
  const visibleDaysToken = viewSummary.byDay.slice(0, daysTokenPage.visible);
  const visibleModels = viewSummary.byModel.slice(0, modelsPage.visible);
  const visibleRecent = viewSummary.recent.slice(0, recentPage.visible);

  return (
    <div className="flex flex-col gap-6">
      <Card className={CARD_SHADOW}>
        <CardContent className="flex flex-col gap-3 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div
              className="inline-flex max-w-full flex-wrap rounded-xl bg-surface p-1"
              role="group"
              aria-label="기간"
            >
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRange(opt.key)}
                  className={cn(
                    "min-h-12 cursor-pointer rounded-lg px-3 py-2 text-base font-semibold transition-colors",
                    range === opt.key
                      ? "bg-card text-foreground shadow-soft"
                      : "text-muted hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="relative block w-full min-w-0 max-w-[15rem] flex-1">
                <Users
                  className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
                  strokeWidth={1.75}
                />
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  aria-label="사용자"
                  className="h-12 w-full appearance-none rounded-xl bg-card py-2 pl-11 pr-8 text-base font-medium text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">전체 사용자</option>
                  {viewUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading}
                aria-label="새로고침"
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface text-foreground transition-colors hover:bg-surface-2 disabled:opacity-60"
              >
                <RefreshCw
                  className={cn("h-4 w-4", loading && "animate-spin")}
                  strokeWidth={1.75}
                />
              </button>
            </div>
          </div>

          {range === "custom" ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-12 rounded-xl bg-card px-3 text-base text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
                aria-label="시작일"
              />
              <span className="text-base text-muted">~</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-12 rounded-xl bg-card px-3 text-base text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
                aria-label="종료일"
              />
            </div>
          ) : null}

          {fx ? (
            <p className="text-sm text-muted">
              일별 환율 적용, $1 = ₩{formatRate(fx.latestRate)} (
              {formatShortDate(fx.latestAsOf)})
            </p>
          ) : null}
        </CardContent>
      </Card>

      <SectionCard title="요약" description="선택한 조건의 추정 비용과 사용량입니다.">
        <div className="grid grid-cols-2 divide-y divide-border lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <StatCell
            label="추정 비용"
            valueNode={
              <MoneyText
                krw={viewSummary.totalKrw}
                usd={viewSummary.totalUsd}
                align="start"
                size="lg"
              />
            }
            hint={`받아쓰기 ${formatKrw(viewSummary.sttKrw)}, 정리 ${formatKrw(viewSummary.structureKrw)}`}
          />
          <StatCell
            label="토큰"
            value={formatTokens(viewSummary.totalTokens)}
            hint={`입력 ${formatTokens(viewSummary.inputTokens)}, 출력 ${formatTokens(viewSummary.outputTokens)}`}
          />
          <StatCell
            label="오디오"
            value={`${viewSummary.audioMinutes.toFixed(1)}분`}
            hint={`회의 ${viewSummary.meetingCount}건`}
          />
          <StatCell
            label="호출"
            value={String(viewSummary.eventCount)}
            hint={
              userId === "all"
                ? `사용자 ${viewUsers.length}명`
                : userLabel(userId)
            }
          />
        </div>
      </SectionCard>

      {empty ? (
        <Card className={CARD_SHADOW}>
          <CardContent className="px-6 py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <Gauge className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <p className="text-lg font-semibold text-foreground">
              선택한 조건에 기록이 없습니다
            </p>
            <p className="mx-auto mt-2 max-w-md text-base text-muted">
              기간이나 사용자를 바꾸거나, 회의를 처리하면 여기에 쌓입니다.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {showUserList ? (
            <SectionCard
              title="사용자별"
              description={`${viewSummary.byUser.length}명, 비용 높은 순`}
            >
              <ul className="divide-y divide-border">
                {visibleUsers.map((u) => {
                  const max = Math.max(
                    ...viewSummary.byUser.map((x) => x.krw || x.usd),
                    0.000001,
                  );
                  const pct = Math.round(((u.krw || u.usd) / max) * 100);
                  return (
                    <li key={u.userId}>
                      <button
                        type="button"
                        onClick={() => setUserId(u.userId)}
                        className="flex min-h-12 w-full flex-col gap-2 py-3.5 text-left transition-colors hover:bg-surface/80 sm:flex-row sm:items-center sm:gap-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-lg font-semibold text-foreground">
                            {userLabel(u.userId)}
                          </p>
                          <p className="mt-1 text-base text-muted">
                            회의 {u.meetingCount}건, 호출 {u.jobs}회,{" "}
                            {formatTokens(u.tokens)} 토큰
                          </p>
                        </div>
                        <div className="w-full sm:w-44">
                          <div className="mb-1 flex justify-end">
                            <MoneyText krw={u.krw} usd={u.usd} />
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <ListPager
                total={viewSummary.byUser.length}
                visible={usersPage.visible}
                pageSize={PAGE_USERS}
                onMore={() => usersPage.showMore(viewSummary.byUser.length)}
                onCollapse={usersPage.collapse}
              />
            </SectionCard>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-5">
            <SectionCard
              className="lg:col-span-3"
              title="일별 추정 비용"
              description={`받아쓰기 + 정리, ${viewSummary.byDay.length}일`}
            >
              {viewSummary.byDay.length === 0 ? (
                <EmptyChart />
              ) : (
                <>
                  <ul className="divide-y divide-border">
                    {visibleDaysCost.map((d) => {
                      const sttPct = Math.round(
                        ((d.sttKrw || d.sttUsd) / maxDayKrw) * 100,
                      );
                      const structPct = Math.round(
                        ((d.structureKrw || d.structureUsd) / maxDayKrw) * 100,
                      );
                      return (
                        <li key={d.date} className="space-y-2 py-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base tabular-nums text-muted">
                              {formatShortDate(d.date)}
                            </span>
                            <MoneyText krw={d.totalKrw} usd={d.totalUsd} />
                          </div>
                          <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
                            <span
                              className="h-full"
                              style={{
                                width: `${sttPct}%`,
                                background: COLORS.stt,
                              }}
                            />
                            <span
                              className="h-full"
                              style={{
                                width: `${structPct}%`,
                                background: COLORS.structure,
                              }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <ListPager
                    total={viewSummary.byDay.length}
                    visible={daysCostPage.visible}
                    pageSize={PAGE_DAYS}
                    onMore={() =>
                      daysCostPage.showMore(viewSummary.byDay.length)
                    }
                    onCollapse={daysCostPage.collapse}
                  />
                </>
              )}
              <LegendRow
                items={[
                  { label: "받아쓰기", color: COLORS.stt },
                  { label: "정리", color: COLORS.structure },
                ]}
              />
            </SectionCard>

            <SectionCard
              className="lg:col-span-2"
              title="비용 비중"
              description="받아쓰기와 정리 비율"
            >
              {pieTotal <= 0 ? (
                <EmptyChart />
              ) : (
                <div className="flex flex-col items-center gap-5 py-2">
                  <Donut
                    stt={viewSummary.sttKrw || viewSummary.sttUsd}
                    structure={
                      viewSummary.structureKrw || viewSummary.structureUsd
                    }
                    totalLabel={formatKrw(viewSummary.totalKrw)}
                  />
                  <ul className="w-full divide-y divide-border">
                    <li className="flex items-center justify-between gap-2 py-3">
                      <span className="flex items-center gap-2 text-base text-muted">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: COLORS.stt }}
                        />
                        받아쓰기
                      </span>
                      <MoneyText
                        krw={viewSummary.sttKrw}
                        usd={viewSummary.sttUsd}
                      />
                    </li>
                    <li className="flex items-center justify-between gap-2 py-3">
                      <span className="flex items-center gap-2 text-base text-muted">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: COLORS.structure }}
                        />
                        정리
                      </span>
                      <MoneyText
                        krw={viewSummary.structureKrw}
                        usd={viewSummary.structureUsd}
                      />
                    </li>
                  </ul>
                </div>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard
              title="일별 토큰"
              description={`입력 + 출력, ${viewSummary.byDay.length}일`}
            >
              {viewSummary.byDay.length === 0 ? (
                <EmptyChart />
              ) : (
                <>
                  <ul className="divide-y divide-border">
                    {visibleDaysToken.map((d) => {
                      const inPct = Math.round(
                        (d.inputTokens / maxDayTokens) * 100,
                      );
                      const outPct = Math.round(
                        (d.outputTokens / maxDayTokens) * 100,
                      );
                      return (
                        <li key={d.date} className="space-y-2 py-3.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-base tabular-nums text-muted">
                              {formatShortDate(d.date)}
                            </span>
                            <span className="text-base font-semibold tabular-nums text-foreground">
                              {formatTokens(d.totalTokens)}
                            </span>
                          </div>
                          <div className="flex h-2 overflow-hidden rounded-full bg-surface-2">
                            <span
                              className="h-full"
                              style={{
                                width: `${inPct}%`,
                                background: COLORS.tokensIn,
                              }}
                            />
                            <span
                              className="h-full"
                              style={{
                                width: `${outPct}%`,
                                background: COLORS.tokensOut,
                              }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <ListPager
                    total={viewSummary.byDay.length}
                    visible={daysTokenPage.visible}
                    pageSize={PAGE_DAYS}
                    onMore={() =>
                      daysTokenPage.showMore(viewSummary.byDay.length)
                    }
                    onCollapse={daysTokenPage.collapse}
                  />
                </>
              )}
              <LegendRow
                items={[
                  { label: "입력", color: COLORS.tokensIn },
                  { label: "출력", color: COLORS.tokensOut },
                ]}
              />
            </SectionCard>

            <SectionCard
              title="모델별"
              description={`단계·모델 비용, ${viewSummary.byModel.length}종`}
            >
              {viewSummary.byModel.length === 0 ? (
                <EmptyChart />
              ) : (
                <>
                  <ul className="divide-y divide-border">
                    {visibleModels.map((row) => {
                      const max = Math.max(
                        ...viewSummary.byModel.map((m) => m.krw || m.usd),
                        0.000001,
                      );
                      const pct = Math.round(
                        ((row.krw || row.usd) / max) * 100,
                      );
                      return (
                        <li
                          key={`${row.stage}-${row.model}`}
                          className="space-y-2 py-3.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-base font-semibold text-foreground">
                              {row.stage === "stt" ? "받아쓰기" : "정리"},{" "}
                              {row.model}
                            </span>
                            <MoneyText krw={row.krw} usd={row.usd} />
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                background:
                                  row.stage === "stt"
                                    ? COLORS.stt
                                    : COLORS.structure,
                              }}
                            />
                          </div>
                          <p className="text-base text-muted">
                            {row.count}회, {formatTokens(row.tokens)} 토큰
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                  <ListPager
                    total={viewSummary.byModel.length}
                    visible={modelsPage.visible}
                    pageSize={PAGE_MODELS}
                    onMore={() =>
                      modelsPage.showMore(viewSummary.byModel.length)
                    }
                    onCollapse={modelsPage.collapse}
                  />
                </>
              )}
            </SectionCard>
          </div>

          <details className={cn(CARD_SHADOW, "group bg-card")}>
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-6 py-4 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="text-xl font-bold tracking-tight text-foreground">
                  최근 호출
                </span>
                <span className="ml-2 text-base font-medium text-muted">
                  최신 {viewSummary.recent.length}건
                </span>
              </span>
              <ChevronDown
                className="h-5 w-5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
                strokeWidth={1.75}
              />
            </summary>
            <div className="border-t border-border px-6 pb-5 pt-4">
            {viewSummary.recent.length === 0 ? (
              <EmptyChart />
            ) : (
              <>
                <div className="-mx-1 max-h-[min(28rem,70vh)] overflow-auto sm:mx-0">
                  <table className="w-full min-w-[720px] text-left text-base">
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr className="border-b border-border text-base text-muted">
                        <th className="bg-card py-3 pr-3 text-center font-semibold">
                          시각
                        </th>
                        <th className="bg-card py-3 pr-3 font-semibold">단계</th>
                        <th className="bg-card py-3 pr-3 font-semibold">모델</th>
                        {userId === "all" ? (
                          <th className="bg-card py-3 pr-3 font-semibold">
                            사용자
                          </th>
                        ) : null}
                        <th className="bg-card py-3 pr-3 font-semibold">회의</th>
                        <th className="bg-card py-3 pr-3 text-center font-semibold">
                          토큰
                        </th>
                        <th className="bg-card py-3 text-center font-semibold">
                          비용
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRecent.map((e) => (
                        <tr
                          key={e.id}
                          className="border-b border-border last:border-0"
                        >
                          <td className="whitespace-nowrap py-3.5 pr-3 text-center tabular-nums text-muted">
                            {formatWhen(e.at)}
                          </td>
                          <td className="py-3.5 pr-3 font-semibold text-foreground">
                            {e.stage === "stt" ? "받아쓰기" : "정리"}
                          </td>
                          <td className="max-w-[140px] truncate py-3.5 pr-3 text-foreground">
                            {e.model}
                          </td>
                          {userId === "all" ? (
                            <td className="max-w-[120px] truncate py-3.5 pr-3 text-muted">
                              {userLabel(e.userId)}
                            </td>
                          ) : null}
                          <td className="max-w-[180px] truncate py-3.5 pr-3 text-muted">
                            {e.title || e.meetingId}
                          </td>
                          <td className="whitespace-nowrap py-3.5 pr-3 text-center tabular-nums text-muted">
                            {formatTokens(e.totalTokens)}
                          </td>
                          <td className="whitespace-nowrap py-3.5 text-center">
                            <MoneyText
                              krw={e.estimatedKrw}
                              usd={e.estimatedUsd}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ListPager
                  total={viewSummary.recent.length}
                  visible={recentPage.visible}
                  pageSize={PAGE_RECENT}
                  onMore={() =>
                    recentPage.showMore(viewSummary.recent.length)
                  }
                  onCollapse={recentPage.collapse}
                  emptyLabel="최근 호출 기록이 없습니다"
                />
              </>
            )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn(CARD_SHADOW, className)}>
      <CardHeader className="space-y-0 px-6 pb-0 pt-6">
        <CardTitle className="text-xl font-bold tracking-tight">
          {title}
        </CardTitle>
        {description ? (
          <p className="mt-1.5 text-base font-medium text-muted">{description}</p>
        ) : null}
        <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="px-6 pb-5 pt-1">{children}</CardContent>
    </Card>
  );
}

function StatCell({
  label,
  value,
  valueNode,
  hint,
}: {
  label: string;
  value?: string;
  valueNode?: ReactNode;
  hint: string;
}) {
  return (
    <div className="px-0 py-4 first:pt-3 last:pb-3 lg:px-4 lg:first:pl-0 lg:last:pr-0 lg:py-4">
      <p className="text-base font-semibold text-foreground">{label}</p>
      {valueNode ? (
        <div className="mt-2">{valueNode}</div>
      ) : (
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </p>
      )}
      <p className="mt-1 text-base leading-snug text-muted">{hint}</p>
    </div>
  );
}

function LegendRow({
  items,
}: {
  items: Array<{ label: string; color: string }>;
}) {
  return (
    <ul className="mt-4 flex flex-wrap gap-4 border-t border-border pt-3 text-base text-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function Donut({
  stt,
  structure,
  totalLabel,
}: {
  stt: number;
  structure: number;
  totalLabel: string;
}) {
  const total = stt + structure;
  const sttDeg = total > 0 ? (stt / total) * 360 : 0;
  return (
    <div
      className="relative h-32 w-32 shrink-0 rounded-full sm:h-36 sm:w-36"
      style={{
        background: `conic-gradient(${COLORS.stt} 0deg ${sttDeg}deg, ${COLORS.structure} ${sttDeg}deg 360deg)`,
      }}
      aria-hidden
    >
      <div className="absolute inset-[22%] flex items-center justify-center rounded-full bg-card px-1">
        <span className="text-center text-base font-semibold tabular-nums leading-tight text-foreground">
          {totalLabel}
        </span>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex min-h-24 items-center justify-center py-6 text-base text-muted">
      표시할 데이터가 없습니다
    </div>
  );
}
