"use client";

import {
  AlertTriangle,
  CheckCircle2,
  CirclePause,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OperationsCheck, OperationsReadiness } from "@/lib/operations-readiness-types";
import type { TeamRetentionPreview } from "@/lib/team/retention-policy";
import { cn } from "@/lib/utils";

type MaintenanceResponse = {
  ok?: boolean;
  message?: string;
  retention?: {
    dryRun: boolean;
    candidateMeetings: number;
    deletedMeetings: number;
    deletedLegacyMeetings: number;
    deletedAuditLogs: number;
    failedTeams: Array<{ teamId: string; message: string }>;
  };
};

const STATUS_LABEL: Record<OperationsCheck["status"], string> = {
  ready: "정상",
  attention: "확인 필요",
  paused: "중지됨",
};

const STATUS_CLASS: Record<OperationsCheck["status"], string> = {
  ready: "bg-success-soft text-success",
  attention: "bg-amber-100 text-amber-800",
  paused: "bg-surface-2 text-muted",
};

function StatusIcon({ status }: { status: OperationsCheck["status"] }) {
  if (status === "ready") {
    return <CheckCircle2 className="h-5 w-5 text-success" aria-hidden />;
  }
  if (status === "paused") {
    return <CirclePause className="h-5 w-5 text-muted" aria-hidden />;
  }
  return <AlertTriangle className="h-5 w-5 text-amber-700" aria-hidden />;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function CheckRow({ check }: { check: OperationsCheck }) {
  return (
    <li className="flex min-w-0 items-start gap-3 rounded-2xl bg-surface p-4">
      <StatusIcon status={check.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold text-foreground">{check.label}</p>
          <Badge className={cn("border-0", STATUS_CLASS[check.status])}>
            {STATUS_LABEL[check.status]}
          </Badge>
        </div>
        <p className="mt-1 text-base leading-6 text-muted">{check.detail}</p>
        {check.action ? (
          <p className="mt-1 text-sm leading-5 text-muted-2">{check.action}</p>
        ) : null}
      </div>
    </li>
  );
}

export function OperationsStatusPanel({
  initialReadiness,
  initialRetention,
}: {
  initialReadiness: OperationsReadiness;
  initialRetention: TeamRetentionPreview[];
}) {
  const [readiness, setReadiness] = useState(initialReadiness);
  const [retention, setRetention] = useState(initialRetention);
  const [refreshing, setRefreshing] = useState(false);
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");

  const expiredMeetings = retention.reduce(
    (sum, row) => sum + row.expiredMeetings,
    0,
  );

  async function refresh() {
    setRefreshing(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/operations", {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        ok?: boolean;
        readiness?: OperationsReadiness;
        retention?: TeamRetentionPreview[];
        message?: string;
      };
      if (!response.ok || !data.ok || !data.readiness || !data.retention) {
        setMessage(data.message ?? "운영 상태를 새로 고치지 못했습니다.");
        return;
      }
      setReadiness(data.readiness);
      setRetention(data.retention);
    } catch {
      setMessage("운영 상태를 새로 고치지 못했습니다.");
    } finally {
      setRefreshing(false);
    }
  }

  async function runRetention(dryRun: boolean) {
    setRunning(true);
    setConfirming(false);
    setMessage("");
    try {
      const response = await fetch(
        "/api/internal/maintenance/team-retention",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dryRun }),
        },
      );
      const data = (await response.json()) as MaintenanceResponse;
      if (!response.ok && !data.retention) {
        setMessage(data.message ?? "보존 작업을 실행하지 못했습니다.");
        return;
      }
      const result = data.retention;
      if (result && !dryRun) {
        setMessage(
          `${data.message ?? "보존 작업을 완료했습니다."} 회의 ${result.deletedMeetings}건, 감사 로그 ${result.deletedAuditLogs}건을 정리했습니다.`,
        );
      } else {
        setMessage(
          data.message ??
            `삭제 대상 회의 ${result?.candidateMeetings ?? 0}건을 확인했습니다.`,
        );
      }
      await refresh();
    } catch {
      setMessage("보존 작업을 실행하지 못했습니다.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl shadow-soft ring-1 ring-border">
        <CardHeader className="gap-3 px-6 pb-4 pt-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
              서비스 운영 상태
            </CardTitle>
            <CardDescription className="mt-2 text-base leading-6">
              사용자에게 기능을 열기 전에 연결, 정책, 보존 작업을 한 곳에서
              확인합니다.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="min-h-12 shrink-0 rounded-full px-4 text-base"
            onClick={() => void refresh()}
            disabled={refreshing || running}
          >
            {refreshing ? (
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="h-5 w-5" aria-hidden />
            )}
            새로 고침
          </Button>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6">
          <div className="flex flex-wrap gap-2" aria-label="운영 상태 요약">
            <Badge variant="success" className="px-3 py-1 text-sm">
              정상 {readiness.summary.ready}
            </Badge>
            <Badge className="bg-amber-100 px-3 py-1 text-sm text-amber-800">
              확인 필요 {readiness.summary.attention}
            </Badge>
            <Badge variant="secondary" className="px-3 py-1 text-sm">
              중지됨 {readiness.summary.paused}
            </Badge>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {readiness.checks.map((check) => (
              <CheckRow key={check.id} check={check} />
            ))}
          </ul>
          <p className="text-sm text-muted-2">
            마지막 확인: {formatDate(readiness.generatedAt) ?? "방금"}
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-3xl shadow-soft ring-1 ring-border">
        <CardHeader className="px-6 pb-4 pt-6">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Trash2 className="h-5 w-5 text-primary" aria-hidden />
            팀 기록 보존 작업
          </CardTitle>
          <CardDescription className="mt-2 text-base leading-6">
            팀 정책의 보존기간이 지난 종료·취소 회의만 삭제합니다. 진행 중인
            회의와 보관함 원본 파일은 건드리지 않습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-6 pb-6">
          <div className="rounded-2xl bg-surface p-4">
            <p className="text-lg font-semibold text-foreground">
              현재 삭제 대상 {expiredMeetings}건
            </p>
            <ul className="mt-3 space-y-2 text-base text-muted">
              {retention.filter((row) => row.expiredMeetings > 0).length === 0 ? (
                <li>지금 실행할 보존기간 초과 회의가 없습니다.</li>
              ) : (
                retention
                  .filter((row) => row.expiredMeetings > 0)
                  .map((row) => (
                    <li
                      key={row.teamId}
                      className="flex flex-wrap justify-between gap-2"
                    >
                      <span>{row.teamName}</span>
                      <span>
                        {row.expiredMeetings}건 · {row.retentionDays}일 보관
                      </span>
                    </li>
                  ))
              )}
            </ul>
          </div>
          <div
            className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-base leading-6 text-amber-900"
            role="note"
          >
            삭제는 되돌릴 수 없습니다. 실행 전 대상 목록을 확인하고, 자동
            실행은 운영 스케줄러에서 같은 엔드포인트를 호출하세요.
          </div>
          {confirming ? (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-base font-semibold text-foreground">
                대상 회의 {expiredMeetings}건을 지금 삭제할까요?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  className="min-h-12 rounded-full px-4 text-base"
                  onClick={() => void runRetention(false)}
                  disabled={running || expiredMeetings === 0}
                >
                  {running ? (
                    <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-5 w-5" aria-hidden />
                  )}
                  삭제 실행
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-12 rounded-full px-4 text-base"
                  onClick={() => setConfirming(false)}
                  disabled={running}
                >
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-12 rounded-full px-4 text-base"
                onClick={() => void runRetention(true)}
                disabled={running}
              >
                대상 다시 확인
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="min-h-12 rounded-full px-4 text-base"
                onClick={() => setConfirming(true)}
                disabled={running || expiredMeetings === 0}
              >
                <Trash2 className="h-5 w-5" aria-hidden />
                보존 작업 실행
              </Button>
            </div>
          )}
          {message ? (
            <p className="text-base text-muted" role="status" aria-live="polite">
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
