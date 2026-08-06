"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw, Users } from "lucide-react";

import { AdminSection } from "@/components/admin/admin-section";
import type { BlockedModerationRow } from "@/components/admin/pipeline-stats-dashboard";
import {
  STATS_CATEGORY_TABS,
  StatsAdminMobileRail,
} from "@/components/admin/stats-admin-mobile-rail";
import {
  parseStatsCategory,
  type StatsAdminCategory,
} from "@/lib/stats-admin-category";
import { SurveyStatsDashboard } from "@/components/admin/survey-stats-dashboard";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  fixtureAiUsageEmpty,
  fixtureAiUsageFull,
  fixturePipelineEmpty,
  fixturePipelineFull,
  fixtureSurveyEmpty,
  fixtureSurveyFull,
} from "@/lib/page-ux-fixtures";
import { seoulDateKey, seoulDateKeyDaysAgo } from "@/lib/meeting-date";
import type { PipelineStatsSummary } from "@/lib/stt/pipeline-stats-store";
import type { SurveyStatsSummary } from "@/lib/stt/survey-stats";
import type { AiUsageSummary } from "@/lib/stt/usage-store";
import { cn } from "@/lib/utils";

export type AiUsageUserOption = {
  id: string;
  label: string;
  usd: number;
  krw: number;
  jobs: number;
};

type RangeKey = "today" | "7d" | "30d" | "90d" | "all" | "custom";

const COLORS = {
  stt: "var(--primary)",
  structure: "var(--success)",
  tokens: "var(--muted)",
  done: "var(--success)",
  error: "var(--destructive, #dc2626)",
  blocked: "var(--warning, #d97706)",
  muted: "var(--muted-2)",
};

const STAGE_LABEL: Record<string, string> = {
  stt: "받아쓰기",
  moderation: "검열",
  structure: "구조화",
  other: "기타",
  unknown: "기타",
};

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string }> = [
  { key: "today", label: "오늘" },
  { key: "7d", label: "7일" },
  { key: "30d", label: "30일" },
  { key: "90d", label: "90일" },
  { key: "all", label: "전체" },
  { key: "custom", label: "직접" },
];

function formatKrw(n: number) {
  return new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

function formatUsd(n: number) {
  if (n < 0.01 && n > 0) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function formatTokens(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function formatShortDate(isoDate: string) {
  const [, m, d] = isoDate.split("-");
  return `${Number(m)}/${Number(d)}`;
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
  return { from: customFrom || null, to: customTo || null };
}

function sortedCountEntries(map: Partial<Record<string, number>>, limit = 5) {
  return Object.entries(map)
    .filter((e): e is [string, number] => typeof e[1] === "number")
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
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

/** 일별 선 그래프 — 막대 대신 SVG 폴리라인. */
function LineChart({
  labels,
  series,
  height = 168,
}: {
  labels: string[];
  series: Array<{ id: string; label: string; color: string; values: number[] }>;
  height?: number;
}) {
  const width = 640;
  const pad = { t: 12, r: 8, b: 28, l: 8 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const n = Math.max(labels.length, 1);
  const maxY = Math.max(
    0.000001,
    ...series.flatMap((s) => s.values),
  );

  function xAt(i: number) {
    if (n <= 1) return pad.l + innerW / 2;
    return pad.l + (i / (n - 1)) * innerW;
  }
  function yAt(v: number) {
    return pad.t + innerH - (v / maxY) * innerH;
  }

  const tickStep = Math.max(1, Math.ceil(n / 6));

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full"
        role="img"
        aria-label={series.map((s) => s.label).join(", ")}
      >
        <line
          x1={pad.l}
          y1={pad.t + innerH}
          x2={pad.l + innerW}
          y2={pad.t + innerH}
          stroke="currentColor"
          className="text-border"
          strokeWidth={1}
        />
        {series.map((s) => {
          if (s.values.length === 0) return null;
          const pts = s.values
            .map((v, i) => `${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
            .join(" ");
          const area =
            s.values.length > 1
              ? `${xAt(0).toFixed(1)},${(pad.t + innerH).toFixed(1)} ${pts} ${xAt(s.values.length - 1).toFixed(1)},${(pad.t + innerH).toFixed(1)}`
              : "";
          return (
            <g key={s.id}>
              {area ? (
                <polygon points={area} fill={s.color} opacity={0.12} />
              ) : null}
              <polyline
                points={pts}
                fill="none"
                stroke={s.color}
                strokeWidth={2.25}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          );
        })}
        {labels.map((label, i) =>
          i % tickStep === 0 || i === n - 1 ? (
            <text
              key={`${label}-${i}`}
              x={xAt(i)}
              y={height - 6}
              textAnchor="middle"
              className="fill-muted text-[11px]"
            >
              {label}
            </text>
          ) : null,
        )}
      </svg>
      <ul className="mt-2 flex flex-wrap gap-4 text-base text-muted">
        {series.map((s) => (
          <li key={s.id} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: s.color }}
            />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 구성 비중 — 도넛 (막대 대체). */
function ShareDonut({
  slices,
  center,
}: {
  slices: Array<{ id: string; label: string; value: number; color: string }>;
  center: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  let deg = 0;
  const stops = slices.map((s) => {
    const span = total > 0 ? (s.value / total) * 360 : 0;
    const from = deg;
    deg += span;
    return `${s.color} ${from}deg ${deg}deg`;
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div
        className="relative h-28 w-28 shrink-0 rounded-full sm:h-32 sm:w-32"
        style={{
          background:
            total > 0
              ? `conic-gradient(${stops.join(", ")})`
              : "var(--surface-2)",
        }}
        aria-hidden
      >
        <div className="absolute inset-[22%] flex items-center justify-center rounded-full bg-background px-1">
          <span className="text-center text-base font-semibold tabular-nums leading-tight text-foreground">
            {center}
          </span>
        </div>
      </div>
      <ul className="w-full min-w-0 divide-y divide-border sm:flex-1">
        {slices.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-2 py-2.5"
          >
            <span className="inline-flex min-w-0 items-center gap-2 text-base text-muted">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: s.color }}
              />
              <span className="truncate text-foreground">{s.label}</span>
            </span>
            <span className="shrink-0 text-base font-semibold tabular-nums text-foreground">
              {s.value}
              {total > 0 ? (
                <span className="ml-1.5 font-medium text-muted">
                  {formatPct(s.value / total)}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 상위 N 순위 — 막대 없이 숫자만. */
function RankTable({
  rows,
  valueLabel = "건",
}: {
  rows: Array<{ key: string; label: string; value: number }>;
  valueLabel?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-base text-muted">표시할 데이터가 없습니다</p>
    );
  }
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="divide-y divide-border">
      {rows.map((r, i) => (
        <li
          key={r.key}
          className="flex items-center justify-between gap-3 py-3"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="w-5 shrink-0 text-base tabular-nums text-muted-2">
              {i + 1}
            </span>
            <span className="truncate text-base font-semibold text-foreground">
              {r.label}
            </span>
          </span>
          <span className="shrink-0 text-base tabular-nums text-muted">
            {r.value}
            {valueLabel}
            <span className="ml-1.5 text-muted-2">
              {formatPct(r.value / max)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-base font-semibold text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-foreground">
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-base leading-snug text-muted-2">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * AI 사용량 + 파이프라인 + 검열 + 설문 통합 통계.
 * 카테고리 탭으로 한 화면 길이를 나눔.
 */
export function OpsStatsDashboard({
  initialUsage,
  initialUsers = [],
  initialPipeline,
  initialBlocked = [],
  initialSurvey,
  initialCategory = "usage",
  previewLock = false,
}: {
  initialUsage: AiUsageSummary;
  initialUsers?: AiUsageUserOption[];
  initialPipeline: PipelineStatsSummary;
  initialBlocked?: BlockedModerationRow[];
  initialSurvey: SurveyStatsSummary;
  initialCategory?: StatsAdminCategory | string;
  /** 디자인 랩: 초기 fixture만 쓰고 API 새로고침 안 함 */
  previewLock?: boolean;
}) {
  const { scenarioId } = usePageUxPreview();
  const [category, setCategory] = useState<StatsAdminCategory>(() =>
    parseStatsCategory(initialCategory),
  );

  function selectCategory(next: StatsAdminCategory) {
    setCategory(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (next === "usage") url.searchParams.delete("cat");
    else url.searchParams.set("cat", next);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }
  const [usage, setUsage] = useState(initialUsage);
  const [users, setUsers] = useState(initialUsers);
  const [pipeline, setPipeline] = useState(initialPipeline);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [range, setRange] = useState<RangeKey>("30d");
  const [customFrom, setCustomFrom] = useState(daysAgoKey(29));
  const [customTo, setCustomTo] = useState(todayKey());
  const [userId, setUserId] = useState("all");
  const [loading, setLoading] = useState(false);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [reprocessedIds, setReprocessedIds] = useState<Set<string>>(new Set());

  const bounds = useMemo(
    () => rangeToBounds(range, customFrom, customTo),
    [range, customFrom, customTo],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (userId !== "all") q.set("userId", userId);
      if (bounds.from) q.set("from", bounds.from);
      if (bounds.to) q.set("to", bounds.to);
      const [usageRes, pipeRes] = await Promise.all([
        fetch(`/api/admin/ai-usage?${q.toString()}`, { cache: "no-store" }),
        fetch("/api/admin/pipeline-stats", { cache: "no-store" }),
      ]);
      const usageData = (await usageRes.json()) as {
        ok?: boolean;
        summary?: AiUsageSummary;
        users?: AiUsageUserOption[];
      };
      const pipeData = (await pipeRes.json()) as {
        ok?: boolean;
        summary?: PipelineStatsSummary;
        blocked?: BlockedModerationRow[];
      };
      if (usageData.ok && usageData.summary) setUsage(usageData.summary);
      if (usageData.ok && Array.isArray(usageData.users)) {
        setUsers(usageData.users);
      }
      if (pipeData.ok && pipeData.summary) setPipeline(pipeData.summary);
      if (pipeData.ok && Array.isArray(pipeData.blocked)) {
        setBlocked(pipeData.blocked);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, bounds.from, bounds.to]);

  useEffect(() => {
    if (previewLock) return;
    if (scenarioId === "empty" || scenarioId === "full" || scenarioId === "loading") {
      return;
    }
    void refresh();
  }, [refresh, scenarioId, previewLock]);

  const viewUsage = useMemo(() => {
    if (previewLock) return usage;
    if (scenarioId === "empty") return fixtureAiUsageEmpty();
    if (scenarioId === "full") return fixtureAiUsageFull();
    return usage;
  }, [scenarioId, usage, previewLock]);

  const viewUsers = useMemo(() => {
    if (previewLock) return users;
    if (scenarioId === "empty") return [];
    if (scenarioId === "full") {
      return viewUsage.byUser.map((u) => ({
        id: u.userId,
        label: u.userId,
        usd: u.usd,
        krw: u.krw,
        jobs: u.jobs,
      }));
    }
    return users;
  }, [scenarioId, viewUsage.byUser, users, previewLock]);

  const viewPipeline = useMemo(() => {
    if (previewLock) return pipeline;
    if (scenarioId === "empty") return fixturePipelineEmpty();
    if (scenarioId === "full") return fixturePipelineFull();
    return pipeline;
  }, [scenarioId, pipeline, previewLock]);

  const viewBlocked = useMemo(() => {
    if (previewLock) return blocked;
    if (scenarioId === "empty") return [];
    if (scenarioId === "full") {
      return [
        {
          id: "ux-mod-1",
          userId: "ux-user-1",
          meetingId: "ux-meet-1",
          categories: ["violence"],
          maxScore: 0.91,
          createdAt: new Date().toISOString(),
        },
      ] satisfies BlockedModerationRow[];
    }
    return blocked;
  }, [scenarioId, blocked, previewLock]);

  const viewSurvey = useMemo(() => {
    if (previewLock) return initialSurvey;
    if (scenarioId === "empty") return fixtureSurveyEmpty();
    if (scenarioId === "full") return fixtureSurveyFull();
    return initialSurvey;
  }, [scenarioId, initialSurvey, previewLock]);

  if (scenarioId === "loading") {
    return (
      <div className="grid min-h-56 place-items-center">
        <LoaderCircle
          className="h-6 w-6 animate-spin text-muted"
          aria-label="불러오는 중"
        />
      </div>
    );
  }

  const daysAsc = [...viewUsage.byDay].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const dayLabels = daysAsc.map((d) => formatShortDate(d.date));
  const costStt = daysAsc.map((d) => d.sttKrw || d.sttUsd);
  const costStruct = daysAsc.map((d) => d.structureKrw || d.structureUsd);
  const tokenTotals = daysAsc.map((d) => d.totalTokens);

  const topUsers = viewUsage.byUser.slice(0, 5).map((u) => ({
    key: u.userId,
    label:
      viewUsers.find((x) => x.id === u.userId)?.label || u.userId,
    value: Math.round(u.krw || u.usd),
  }));

  const topModels = viewUsage.byModel.slice(0, 5).map((m) => ({
    key: `${m.stage}-${m.model}`,
    label: `${m.stage === "stt" ? "받아쓰기" : "정리"} · ${m.model}`,
    value: Math.round(m.krw || m.usd),
  }));

  const failSlices = [
    {
      id: "done",
      label: "완료",
      value: viewPipeline.done,
      color: COLORS.done,
    },
    {
      id: "error",
      label: "오류",
      value: viewPipeline.error,
      color: COLORS.error,
    },
    {
      id: "moderation",
      label: "검열 차단",
      value: viewPipeline.moderationBlocked,
      color: COLORS.blocked,
    },
  ].filter((s) => s.value > 0);

  const stageRows = sortedCountEntries(viewPipeline.byFailedStage, 5).map(
    ([k, v]) => ({
      key: k,
      label: STAGE_LABEL[k] ?? k,
      value: v,
    }),
  );
  const modelRows = sortedCountEntries(viewPipeline.byModel, 5).map(([k, v]) => ({
    key: k,
    label: k,
    value: v,
  }));
  const TOPIC_LABEL: Record<string, string> = {
    education: "교육",
    medical: "의료",
    government_policy: "정부/정책",
    business: "경영/영업",
    hr_org: "인사/조직",
    tech_dev: "기술/개발",
    academic: "학술/연구",
    event: "행사",
    other: "기타",
    unknown: "미분류",
  };

  const topicRows = sortedCountEntries(viewPipeline.byTopicBucket, 5).map(
    ([k, v]) => ({
      key: k,
      label: TOPIC_LABEL[k] ?? k,
      value: v,
    }),
  );

  return (
    <div
      className={cn(
        "relative flex flex-col gap-6 pb-[calc(env(safe-area-inset-bottom,0px)+11rem)] md:pb-0",
        previewLock && "min-h-full",
      )}
    >
      <div className="hidden items-end border-b border-border md:flex">
        <div
          role="tablist"
          aria-label="통계 분류"
          className="flex min-w-0 flex-wrap gap-x-6"
        >
          {STATS_CATEGORY_TABS.map((item) => {
            const selected = category === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectCategory(item.id)}
                className={cn(
                  "inline-flex min-h-12 shrink-0 items-center border-b-2 px-1 pb-3 pt-1 text-base transition-colors",
                  selected
                    ? "border-foreground font-semibold text-foreground"
                    : "border-transparent font-semibold text-muted hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {category === "survey" ? (
        <div role="tabpanel" aria-label="설문">
          <SurveyStatsDashboard initial={viewSurvey} />
        </div>
      ) : null}

      {category !== "survey" ? (
        <div className="flex flex-col gap-8" role="tabpanel" aria-label={
          category === "usage"
            ? "사용량"
            : category === "pipeline"
              ? "파이프라인"
              : "검열"
        }>
          {category === "usage" || category === "pipeline" ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                {category === "usage" ? (
                  <div
                    className="inline-flex max-w-full flex-wrap gap-2"
                    role="group"
                    aria-label="기간"
                  >
                    {RANGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setRange(opt.key)}
                        className={cn(
                          "min-h-12 min-w-12 cursor-pointer rounded-xl bg-transparent px-3 py-2 text-base font-semibold transition-colors",
                          range === opt.key
                            ? "text-foreground ring-1 ring-inset ring-border-strong"
                            : "text-muted hover:bg-surface/70 hover:text-foreground",
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-base text-muted">
                    최근 파이프라인 처리 지표
                  </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {category === "usage" ? (
                    <label className="relative block w-full min-w-0 max-w-[15rem] flex-1">
                      <Users
                        className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
                        strokeWidth={1.75}
                      />
                      <select
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        aria-label="사용자"
                        className="h-12 w-full appearance-none rounded-xl bg-transparent py-2 pl-11 pr-8 text-base font-medium text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
                      >
                        <option value="all">전체 사용자</option>
                        {viewUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={loading}
                    aria-label="새로고침"
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-surface/70 disabled:opacity-60"
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", loading && "animate-spin")}
                      strokeWidth={1.75}
                    />
                  </button>
                </div>
              </div>
              {category === "usage" && range === "custom" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={customFrom}
                    onChange={(e) => setCustomFrom(e.target.value)}
                    className="h-12 rounded-xl bg-transparent px-3 text-base text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
                    aria-label="시작일"
                  />
                  <span className="text-base text-muted">~</span>
                  <input
                    type="date"
                    value={customTo}
                    onChange={(e) => setCustomTo(e.target.value)}
                    className="h-12 rounded-xl bg-transparent px-3 text-base text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary"
                    aria-label="종료일"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {category === "usage" ? (
            <>
              <div className="grid grid-cols-2 gap-6">
                <Kpi
                  label="추정 비용"
                  value={formatKrw(viewUsage.totalKrw)}
                  hint={formatUsd(viewUsage.totalUsd)}
                />
                <Kpi
                  label="토큰"
                  value={formatTokens(viewUsage.totalTokens)}
                  hint={`호출 ${viewUsage.eventCount}`}
                />
              </div>

              <AdminSection
                title="일별 추정 비용"
                description="받아쓰기 · 정리 (선 그래프)"
              >
                {daysAsc.length === 0 ? (
                  <p className="py-10 text-center text-base text-muted">
                    선택한 조건에 기록이 없습니다
                  </p>
                ) : (
                  <LineChart
                    labels={dayLabels}
                    series={[
                      {
                        id: "stt",
                        label: "받아쓰기",
                        color: COLORS.stt,
                        values: costStt,
                      },
                      {
                        id: "structure",
                        label: "정리",
                        color: COLORS.structure,
                        values: costStruct,
                      },
                    ]}
                  />
                )}
              </AdminSection>

              <AdminSection title="일별 토큰" description="합계 추이">
                {daysAsc.length === 0 ? (
                  <p className="py-10 text-center text-base text-muted">
                    데이터 없음
                  </p>
                ) : (
                  <LineChart
                    labels={dayLabels}
                    series={[
                      {
                        id: "tokens",
                        label: "토큰",
                        color: COLORS.tokens,
                        values: tokenTotals,
                      },
                    ]}
                  />
                )}
              </AdminSection>

              <div className="grid gap-8 lg:grid-cols-2">
                <AdminSection title="비용 상위 사용자" description="상위 5명">
                  <RankTable rows={topUsers} valueLabel="원" />
                </AdminSection>
                <AdminSection title="모델별 비용" description="상위 5">
                  <RankTable rows={topModels} valueLabel="원" />
                </AdminSection>
              </div>
            </>
          ) : null}

          {category === "pipeline" ? (
            <>
              <div className="grid grid-cols-2 gap-6">
                <Kpi
                  label="파이프라인"
                  value={String(viewPipeline.total)}
                  hint={`완료 ${viewPipeline.done}`}
                />
                <Kpi
                  label="실패율"
                  value={formatPct(viewPipeline.failureRate)}
                  hint={`오류 ${viewPipeline.error}, 검열 ${viewPipeline.moderationBlocked}`}
                />
              </div>

              <AdminSection title="처리 결과" description="파이프라인 구성">
                {viewPipeline.total === 0 ? (
                  <p className="py-10 text-center text-base text-muted">
                    아직 처리 기록이 없습니다
                  </p>
                ) : (
                  <ShareDonut
                    center={String(viewPipeline.total)}
                    slices={
                      failSlices.length > 0
                        ? failSlices
                        : [
                            {
                              id: "done",
                              label: "완료",
                              value: viewPipeline.done,
                              color: COLORS.done,
                            },
                          ]
                    }
                  />
                )}
              </AdminSection>

              <div className="grid gap-8 lg:grid-cols-2">
                <AdminSection title="실패 단계" description="상위 5">
                  <RankTable rows={stageRows} />
                </AdminSection>
                <AdminSection title="처리 모델 · 대분류" description="상위 5">
                  <div className="space-y-6">
                    <RankTable rows={modelRows} />
                    <div className="border-t border-border pt-4">
                      <p className="mb-2 text-base font-semibold text-muted">
                        대분류
                      </p>
                      <RankTable rows={topicRows} />
                    </div>
                  </div>
                </AdminSection>
              </div>
            </>
          ) : null}

          {category === "moderation" ? (
            <AdminSection
              title="최근 검열 차단"
              description="카테고리·점수만. 본문 없음."
              trailing={
                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={loading}
                  aria-label="새로고침"
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border text-foreground transition-colors hover:bg-surface/70 disabled:opacity-60"
                >
                  <RefreshCw
                    className={cn("h-4 w-4", loading && "animate-spin")}
                    strokeWidth={1.75}
                  />
                </button>
              }
            >
              {viewBlocked.length === 0 ? (
                <p className="py-8 text-center text-base text-muted">
                  차단된 기록이 없습니다
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {viewBlocked.slice(0, 12).map((row) => {
                    const done = row.meetingId
                      ? reprocessedIds.has(row.meetingId)
                      : false;
                    return (
                      <li
                        key={row.id}
                        className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-foreground">
                            {row.categories.join(", ") || "미분류"}
                          </p>
                          <p className="mt-1 text-base text-muted">
                            점수 {row.maxScore.toFixed(2)},{" "}
                            {formatWhen(row.createdAt)}
                          </p>
                        </div>
                        {row.meetingId ? (
                          <button
                            type="button"
                            disabled={
                              reprocessingId === row.meetingId || done
                            }
                            onClick={() => {
                              void (async () => {
                                if (
                                  !window.confirm(
                                    "이의제기 건만 재처리하세요. 검열을 건너뛰고 다시 처리할까요?",
                                  )
                                ) {
                                  return;
                                }
                                setReprocessingId(row.meetingId);
                                try {
                                  const res = await fetch(
                                    "/api/admin/moderation/reprocess",
                                    {
                                      method: "POST",
                                      headers: {
                                        "Content-Type": "application/json",
                                      },
                                      body: JSON.stringify({
                                        meetingId: row.meetingId,
                                      }),
                                    },
                                  );
                                  const data = (await res.json()) as {
                                    ok?: boolean;
                                    error?: string;
                                  };
                                  if (data.ok) {
                                    setReprocessedIds((prev) =>
                                      new Set(prev).add(row.meetingId!),
                                    );
                                  } else {
                                    window.alert(
                                      data.error ??
                                        "재처리 요청에 실패했습니다.",
                                    );
                                  }
                                } finally {
                                  setReprocessingId(null);
                                }
                              })();
                            }}
                            className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-border px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface/70 disabled:opacity-60"
                          >
                            {done
                              ? "재처리 요청됨"
                              : reprocessingId === row.meetingId
                                ? "요청 중…"
                                : "이의제기 재처리"}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </AdminSection>
          ) : null}
        </div>
      ) : null}

      <StatsAdminMobileRail
        active={category}
        onChange={selectCategory}
        embed={previewLock}
      />
    </div>
  );
}
