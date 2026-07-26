"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AudioLines,
  CircleDollarSign,
  Gauge,
  Hash,
  LoaderCircle,
  Radio,
  RefreshCw,
  Users,
} from "lucide-react";

import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  fixtureAiUsageEmpty,
  fixtureAiUsageFull,
} from "@/lib/page-ux-fixtures";
import { seoulDateKey, seoulDateKeyDaysAgo } from "@/lib/meeting-date";
import type { AiUsageSummary } from "@/lib/stt/usage-store";
import { cn } from "@/lib/utils";

const COLORS = {
  stt: "#0071e3",
  structure: "#248a3d",
  tokensIn: "#5b6b8c",
  tokensOut: "#9a6700",
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
          size === "md" && "text-sm",
          size === "sm" && "text-sm",
        )}
      >
        {formatKrw(krw)}
      </span>
      <span className="text-xs font-medium text-muted-2">
        {formatUsd(usd)}
      </span>
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
              label: u.userId === "ux-user-1" ? "김서연" : "최민준",
              usd: u.usd,
              krw: u.krw,
              jobs: u.jobs,
            }))
          : users,
    [scenarioId, viewSummary.byUser, users],
  );

  if (scenarioId === "loading") {
    return (
      <div className="grid min-h-56 place-items-center rounded-2xl bg-card shadow-soft">
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
    viewUsers.find((u) => u.id === id)?.label || id;
  const fx = viewSummary.fx;

  return (
    <div className="flex flex-col gap-6">
      {/* M3 filter group: period + user + refresh */}
      <section
        className="rounded-3xl bg-surface px-4 py-4 sm:px-5"
        aria-label="조회 조건"
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-2">
              기간
            </p>
            <div className="flex flex-wrap gap-2">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setRange(opt.key)}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors",
                    range === opt.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-foreground ring-1 ring-border hover:bg-surface-2",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {range === "custom" ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-10 rounded-xl bg-card px-3 text-sm text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
                  aria-label="시작일"
                />
                <span className="text-sm text-muted">~</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-10 rounded-xl bg-card px-3 text-sm text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
                  aria-label="종료일"
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs font-medium tracking-wide text-muted-2">
                사용자
              </p>
              <label className="relative block max-w-md">
                <Users
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                  strokeWidth={1.75}
                />
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="h-11 w-full appearance-none rounded-xl bg-card py-2 pl-10 pr-10 text-sm font-medium text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">전체 사용자</option>
                  {viewUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-card px-4 text-sm font-semibold text-foreground ring-1 ring-border transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <RefreshCw
                className={cn("h-4 w-4", loading && "animate-spin")}
                strokeWidth={1.75}
              />
              새로고침
            </button>
          </div>
          {fx ? (
            <p className="text-xs text-muted-2">
              일별 환율 적용, $1 = ₩{formatRate(fx.latestRate)} (
              {formatShortDate(fx.latestAsOf)})
            </p>
          ) : null}
        </div>
      </section>

      {/* KPI */}
      <section
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label="요약"
      >
        <StatCard
          icon={<CircleDollarSign className="h-4 w-4" strokeWidth={1.75} />}
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
        <StatCard
          icon={<Hash className="h-4 w-4" strokeWidth={1.75} />}
          label="토큰"
          value={formatTokens(viewSummary.totalTokens)}
          hint={`입력 ${formatTokens(viewSummary.inputTokens)}, 출력 ${formatTokens(viewSummary.outputTokens)}`}
        />
        <StatCard
          icon={<AudioLines className="h-4 w-4" strokeWidth={1.75} />}
          label="오디오"
          value={`${(viewSummary.audioMinutes).toFixed(1)}분`}
          hint={`회의 ${viewSummary.meetingCount}건`}
        />
        <StatCard
          icon={<Radio className="h-4 w-4" strokeWidth={1.75} />}
          label="호출"
          value={String(viewSummary.eventCount)}
          hint={
            userId === "all"
              ? `사용자 ${viewUsers.length}명`
              : userLabel(userId)
          }
        />
      </section>

      {empty ? (
        <div className="rounded-3xl bg-surface px-5 py-16 text-center sm:px-6">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Gauge className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <p className="text-base font-semibold text-foreground">
            선택한 조건에 기록이 없습니다
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            기간이나 사용자를 바꾸거나, 회의를 처리하면 여기에 쌓입니다.
          </p>
        </div>
      ) : (
        <>
          {showUserList ? (
            <Panel
              title="사용자별"
              supporting={`${viewSummary.byUser.length}명, 비용 높은 순`}
            >
              <ul className="divide-y divide-border">
                {viewSummary.byUser.map((u) => {
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
                        className="flex w-full flex-col gap-2 py-3 text-left transition-colors hover:bg-surface/80 sm:flex-row sm:items-center sm:gap-4"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {userLabel(u.userId)}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
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
            </Panel>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-5">
            <Panel
              className="lg:col-span-3"
              title="일별 추정 비용"
              supporting="받아쓰기 + 정리"
            >
              {viewSummary.byDay.length === 0 ? (
                <EmptyChart />
              ) : (
                <ul className="space-y-3">
                  {viewSummary.byDay.map((d) => {
                    const sttPct = Math.round(
                      ((d.sttKrw || d.sttUsd) / maxDayKrw) * 100,
                    );
                    const structPct = Math.round(
                      ((d.structureKrw || d.structureUsd) / maxDayKrw) * 100,
                    );
                    return (
                      <li key={d.date} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="tabular-nums text-muted">
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
              )}
              <LegendRow
                items={[
                  { label: "받아쓰기", color: COLORS.stt },
                  { label: "정리", color: COLORS.structure },
                ]}
              />
            </Panel>

            <Panel className="lg:col-span-2" title="비용 비중">
              {pieTotal <= 0 ? (
                <EmptyChart />
              ) : (
                <div className="flex flex-col items-center gap-5 py-2">
                  <Donut
                    stt={viewSummary.sttKrw || viewSummary.sttUsd}
                    structure={viewSummary.structureKrw || viewSummary.structureUsd}
                    totalLabel={formatKrw(viewSummary.totalKrw)}
                  />
                  <ul className="w-full space-y-2 text-sm">
                    <li className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-muted">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: COLORS.stt }}
                        />
                        받아쓰기
                      </span>
                      <MoneyText krw={viewSummary.sttKrw} usd={viewSummary.sttUsd} />
                    </li>
                    <li className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-muted">
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
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="일별 토큰" supporting="입력 + 출력">
              {viewSummary.byDay.length === 0 ? (
                <EmptyChart />
              ) : (
                <ul className="space-y-3">
                  {viewSummary.byDay.map((d) => {
                    const inPct = Math.round(
                      (d.inputTokens / maxDayTokens) * 100,
                    );
                    const outPct = Math.round(
                      (d.outputTokens / maxDayTokens) * 100,
                    );
                    return (
                      <li key={d.date} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="tabular-nums text-muted">
                            {formatShortDate(d.date)}
                          </span>
                          <span className="font-medium tabular-nums text-foreground">
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
              )}
              <LegendRow
                items={[
                  { label: "입력", color: COLORS.tokensIn },
                  { label: "출력", color: COLORS.tokensOut },
                ]}
              />
            </Panel>

            <Panel title="모델별">
              <div className="space-y-4">
                {viewSummary.byModel.length === 0 ? (
                  <EmptyChart />
                ) : (
                  viewSummary.byModel.map((row) => {
                    const max = Math.max(
                      ...viewSummary.byModel.map((m) => m.krw || m.usd),
                      0.000001,
                    );
                    const pct = Math.round(((row.krw || row.usd) / max) * 100);
                    return (
                      <div
                        key={`${row.stage}-${row.model}`}
                        className="space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate font-medium text-foreground">
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
                        <p className="text-xs text-muted-2">
                          {row.count}회, {formatTokens(row.tokens)} 토큰
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </Panel>
          </div>

          <Panel title="최근 호출" supporting="최신 40건">
            <div className="-mx-1 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-2">
                    <th className="pb-3 pr-3 text-center font-medium">시각</th>
                    <th className="pb-3 pr-3 font-medium">단계</th>
                    <th className="pb-3 pr-3 font-medium">모델</th>
                    {userId === "all" ? (
                      <th className="pb-3 pr-3 font-medium">사용자</th>
                    ) : null}
                    <th className="pb-3 pr-3 font-medium">회의</th>
                    <th className="pb-3 pr-3 text-center font-medium">토큰</th>
                    <th className="pb-3 text-center font-medium">비용</th>
                  </tr>
                </thead>
                <tbody>
                  {viewSummary.recent.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="whitespace-nowrap py-3 pr-3 text-center tabular-nums text-muted">
                        {formatWhen(e.at)}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                            e.stage === "stt"
                              ? "bg-[#e8f1fc] text-[#0071e3]"
                              : "bg-success-soft text-success",
                          )}
                        >
                          {e.stage === "stt" ? "받아쓰기" : "정리"}
                        </span>
                      </td>
                      <td className="max-w-[140px] truncate py-3 pr-3 text-foreground">
                        {e.model}
                      </td>
                      {userId === "all" ? (
                        <td className="max-w-[120px] truncate py-3 pr-3 text-muted">
                          {userLabel(e.userId)}
                        </td>
                      ) : null}
                      <td className="max-w-[180px] truncate py-3 pr-3 text-muted">
                        {e.title || e.meetingId}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-center tabular-nums text-muted">
                        {formatTokens(e.totalTokens)}
                      </td>
                      <td className="whitespace-nowrap py-3 text-center">
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
          </Panel>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  valueNode,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value?: string;
  valueNode?: ReactNode;
  hint: string;
}) {
  return (
    <div className="rounded-3xl bg-card p-4 shadow-soft sm:p-5">
      <div className="flex items-center gap-2.5 text-muted">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          {icon}
        </span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      {valueNode ? (
        <div className="mt-3">{valueNode}</div>
      ) : (
        <p className="mt-3 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </p>
      )}
      <p className="mt-1 text-xs leading-snug text-muted-2">{hint}</p>
    </div>
  );
}

function Panel({
  title,
  supporting,
  children,
  className,
}: {
  title: string;
  supporting?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-3xl bg-card p-4 shadow-soft sm:p-5", className)}
    >
      <div className="mb-4">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {supporting ? (
          <p className="mt-0.5 text-xs text-muted-2">{supporting}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function LegendRow({
  items,
}: {
  items: Array<{ label: string; color: string }>;
}) {
  return (
    <ul className="mt-4 flex flex-wrap gap-4 text-xs text-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
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
        <span className="text-center text-xs font-semibold tabular-nums leading-tight text-foreground sm:text-sm">
          {totalLabel}
        </span>
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex min-h-24 items-center justify-center text-sm text-muted-2">
      표시할 데이터가 없습니다
    </div>
  );
}
