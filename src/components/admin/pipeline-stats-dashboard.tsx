"use client";

import { useCallback, useState } from "react";
import { Activity, RefreshCw, ShieldAlert } from "lucide-react";

import { AdminSection } from "@/components/admin/admin-section";
import type { PipelineStatsSummary } from "@/lib/stt/pipeline-stats-store";
import { cn } from "@/lib/utils";

export type BlockedModerationRow = {
  id: string;
  userId: string;
  meetingId: string | null;
  categories: string[];
  maxScore: number;
  createdAt: string;
};

const STAGE_LABEL: Record<string, string> = {
  stt: "받아쓰기",
  moderation: "검열",
  structure: "구조화",
  other: "기타",
  unknown: "기타",
};

const DURATION_LABEL: Record<string, string> = {
  "0-10": "0~10분",
  "10-30": "10~30분",
  "30-60": "30~60분",
  "60+": "60분+",
  unknown: "길이 미상",
};

const SPEAKER_LABEL: Record<string, string> = {
  "1": "1인",
  "2-3": "2~3인",
  "4-6": "4~6인",
  "7+": "7인+",
  unknown: "화자 미상",
};

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

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function sortedEntries(map: Partial<Record<string, number>>) {
  return Object.entries(map)
    .filter((e): e is [string, number] => typeof e[1] === "number")
    .sort((a, b) => b[1] - a[1]);
}

export function PipelineStatsDashboard({
  initial,
  initialBlocked = [],
}: {
  initial: PipelineStatsSummary;
  initialBlocked?: BlockedModerationRow[];
}) {
  const [summary, setSummary] = useState(initial);
  const [blocked, setBlocked] = useState(initialBlocked);
  const [loading, setLoading] = useState(false);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [reprocessedIds, setReprocessedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pipeline-stats", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        summary?: PipelineStatsSummary;
        blocked?: BlockedModerationRow[];
      };
      if (data.ok && data.summary) setSummary(data.summary);
      if (data.ok && Array.isArray(data.blocked)) setBlocked(data.blocked);
    } finally {
      setLoading(false);
    }
  }, []);

  const reprocess = useCallback(async (meetingId: string) => {
    if (
      !window.confirm(
        "이용자 본인의 이의제기를 접수한 건에만 사용하세요. 검열 차단을 건너뛰고 다시 처리할까요?",
      )
    ) {
      return;
    }
    setReprocessingId(meetingId);
    try {
      const res = await fetch("/api/admin/moderation/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setReprocessedIds((prev) => new Set(prev).add(meetingId));
      } else {
        window.alert(data.error ?? "재처리 요청에 실패했습니다.");
      }
    } finally {
      setReprocessingId(null);
    }
  }, []);

  const empty = summary.total === 0;
  const maxStage = Math.max(
    1,
    ...sortedEntries(summary.byFailedStage).map((e) => e[1]),
  );
  const maxModel = Math.max(
    1,
    ...sortedEntries(summary.byModel).map((e) => e[1]),
  );
  const maxDuration = Math.max(
    1,
    ...sortedEntries(summary.byDurationBucket).map((e) => e[1]),
  );
  const maxSpeaker = Math.max(
    1,
    ...sortedEntries(summary.bySpeakerBucket).map((e) => e[1]),
  );
  const maxTopic = Math.max(
    1,
    ...sortedEntries(summary.byTopicBucket).map((e) => e[1]),
  );

  return (
    <div className="flex flex-col gap-8">
      <AdminSection
        title="실패율"
        description="전체 업로드 처리 시도 대비 결과 비율. 회의 내용은 포함하지 않습니다."
        trailing={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-border px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface/70 disabled:opacity-60"
          >
            <RefreshCw
              className={cn("h-4 w-4", loading && "animate-spin")}
              strokeWidth={1.75}
            />
            새로고침
          </button>
        }
      >
        <div className="grid grid-cols-2 divide-y divide-border lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <StatCell
            label="전체 처리"
            value={String(summary.total)}
            hint="업로드 처리 시도 건수"
          />
          <StatCell
            label="실패율"
            value={formatPct(summary.failureRate)}
            hint={`오류 ${summary.error}건, 검열차단 ${summary.moderationBlocked}건`}
          />
          <StatCell
            label="완료"
            value={String(summary.done)}
            hint={
              summary.total > 0 ? formatPct(summary.done / summary.total) : "0%"
            }
          />
          <StatCell
            label="검열 차단"
            value={String(summary.moderationBlocked)}
            hint="정책 위반으로 처리 중단"
          />
        </div>
      </AdminSection>

      {empty ? (
        <div className="px-2 py-16 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center text-primary">
            <Activity className="h-7 w-7" strokeWidth={1.75} />
          </div>
          <p className="text-lg font-semibold text-foreground">
            아직 쌓인 처리 기록이 없습니다
          </p>
          <p className="mx-auto mt-2 max-w-md text-base text-muted">
            회의를 업로드해 처리하면 여기에 통계가 쌓입니다.
          </p>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <AdminSection
            title="어디서 깨졌는지"
            description="실패, 검열차단 건의 단계별 분포"
          >
            <BarList
              entries={sortedEntries(summary.byFailedStage)}
              max={maxStage}
              labelOf={(k) => STAGE_LABEL[k] ?? k}
            />
          </AdminSection>

          <AdminSection title="모델별" description="전체 처리 건수 분포">
            <BarList
              entries={sortedEntries(summary.byModel)}
              max={maxModel}
              labelOf={(k) => k}
            />
          </AdminSection>

          <AdminSection title="길이대별" description="0~10 / 10~30 / 30~60 / 60분+">
            <BarList
              entries={sortedEntries(summary.byDurationBucket)}
              max={maxDuration}
              labelOf={(k) => DURATION_LABEL[k] ?? k}
            />
          </AdminSection>

          <AdminSection title="화자 수대별" description="1 / 2~3 / 4~6 / 7인+">
            <BarList
              entries={sortedEntries(summary.bySpeakerBucket)}
              max={maxSpeaker}
              labelOf={(k) => SPEAKER_LABEL[k] ?? k}
            />
          </AdminSection>

          <AdminSection
            className="lg:col-span-2"
            title="대분류(고정 라벨)"
            description="회의 본문은 포함하지 않는 운영 통계용 대분류"
          >
            <BarList
              entries={sortedEntries(summary.byTopicBucket)}
              max={maxTopic}
              labelOf={(k) => TOPIC_LABEL[k] ?? k}
            />
          </AdminSection>
        </div>
      )}

      <AdminSection
        title="최근 검열 차단"
        description="카테고리, 점수만 표시합니다. 회의 본문은 포함하지 않습니다."
      >
        {blocked.length === 0 ? (
          <div className="flex min-h-24 items-center justify-center py-6 text-base text-muted">
            차단된 기록이 없습니다
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {blocked.map((row) => {
              const done = row.meetingId
                ? reprocessedIds.has(row.meetingId)
                : false;
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-base font-semibold text-foreground">
                      <ShieldAlert
                        className="h-4 w-4 shrink-0 text-warning"
                        strokeWidth={1.75}
                      />
                      {row.categories.join(", ") || "미분류"}
                    </p>
                    <p className="mt-1 text-base text-muted">
                      점수 {row.maxScore.toFixed(2)}, {formatWhen(row.createdAt)}
                      {row.meetingId ? `, 회의 ${row.meetingId}` : ""}
                    </p>
                  </div>
                  {row.meetingId ? (
                    <button
                      type="button"
                      onClick={() => void reprocess(row.meetingId!)}
                      disabled={reprocessingId === row.meetingId || done}
                      className="inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-border px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface/70 disabled:opacity-60"
                    >
                      {done
                        ? "재처리 요청됨"
                        : reprocessingId === row.meetingId
                          ? "요청 중..."
                          : "이의제기 재처리"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </AdminSection>
    </div>
  );
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

function BarList({
  entries,
  max,
  labelOf,
}: {
  entries: [string, number][];
  max: number;
  labelOf: (key: string) => string;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex min-h-24 items-center justify-center py-6 text-base text-muted">
        표시할 데이터가 없습니다
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {entries.map(([key, count]) => {
        const pct = Math.round((count / max) * 100);
        return (
          <li key={key} className="space-y-2 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-semibold text-foreground">
                {labelOf(key)}
              </span>
              <span className="text-base tabular-nums text-muted">{count}건</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatCell({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="px-0 py-4 first:pt-3 last:pb-3 lg:px-4 lg:first:pl-0 lg:last:pr-0 lg:py-4">
      <p className="text-base font-semibold text-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-base leading-snug text-muted">{hint}</p>
    </div>
  );
}
