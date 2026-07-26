"use client";

import { LoaderCircle, ScrollText } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { useTeamRolePreview } from "@/context/team-role-preview-context";

type AuditLog = {
  id: string;
  action: string;
  createdAt: string;
  actor: { id: string; name: string | null; handle: string | null } | null;
  targetUser: { id: string; name: string | null; handle: string | null } | null;
};

function formatWhen(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function actorLabel(actor: AuditLog["actor"] | AuditLog["targetUser"]): string {
  if (!actor) return "시스템";
  return actor.name || actor.handle || "사용자";
}

export function TeamAuditPanel() {
  const { activeTeamId } = useAppContext();
  const { scenarioId } = usePageUxPreview();
  const { previewRole, isPreviewing } = useTeamRolePreview();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const previewDenied = isPreviewing && previewRole !== "OWNER";

  const load = useCallback(async (teamId: string) => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/teams/${teamId}/audit`, {
        cache: "no-store",
      });
      const data = (await response.json()) as {
        ok?: boolean;
        logs?: AuditLog[];
        retentionDays?: number;
        message?: string;
      };
      if (!response.ok || !data.ok) {
        setLogs([]);
        setMessage(
          data.message ??
            (response.status === 403
              ? "감사 로그는 팀 대표만 볼 수 있습니다."
              : "감사 로그를 불러오지 못했습니다."),
        );
        return;
      }
      setLogs(data.logs ?? []);
      setRetentionDays(data.retentionDays ?? null);
    } catch {
      setLogs([]);
      setMessage("감사 로그를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeTeamId) {
      queueMicrotask(() => {
        setLoading(false);
        setLogs([]);
        setMessage("팀을 먼저 선택하세요.");
      });
      return;
    }
    queueMicrotask(() => void load(activeTeamId));
  }, [activeTeamId, load]);

  if (
    (loading && scenarioId === "live" && !previewDenied) ||
    scenarioId === "loading"
  ) {
    return (
      <div className="grid min-h-56 place-items-center rounded-[28px] border border-border bg-card">
        <LoaderCircle
          className="h-6 w-6 animate-spin text-muted"
          aria-label="불러오는 중"
        />
      </div>
    );
  }

  if ((message && scenarioId === "live") || previewDenied) {
    return (
      <div className="grid min-h-56 place-items-center rounded-[28px] border border-border bg-card p-6 text-center">
        <ScrollText className="h-8 w-8 text-muted" aria-hidden />
        <p className="mt-3 text-base text-muted">
          {previewDenied
            ? "감사 로그는 팀 대표만 볼 수 있습니다."
            : message}
        </p>
        <Button asChild variant="secondary" className="mt-4 min-h-12">
          <Link href="/team">팀 공간으로</Link>
        </Button>
      </div>
    );
  }

  const viewLogs =
    scenarioId === "empty"
      ? []
      : scenarioId === "full"
        ? logs.length > 0
          ? logs
          : Array.from({ length: 10 }, (_, index) => ({
              id: `ux-audit-${index + 1}`,
              action: index % 2 === 0 ? "MEMBER_INVITED" : "MEETING_CREATED",
              createdAt: new Date(Date.now() - index * 3600_000).toISOString(),
              actor: {
                id: "ux-actor",
                name: "관리자",
                handle: "admin",
              },
              targetUser:
                index % 3 === 0
                  ? { id: "ux-target", name: "팀원", handle: "member" }
                  : null,
            }))
        : logs;

  return (
    <section className="rounded-[28px] border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">최근 이벤트</h2>
          {retentionDays ? (
            <p className="mt-1 text-base text-muted">{retentionDays}일 보관</p>
          ) : null}
        </div>
        <Button asChild variant="ghost" className="min-h-12">
          <Link href="/team">팀 공간으로</Link>
        </Button>
      </div>
      {viewLogs.length === 0 ? (
        <p className="mt-6 text-base text-muted">기록이 없습니다.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {viewLogs.map((log) => (
            <li
              key={log.id}
              className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-lg font-semibold text-foreground">
                  {log.action}
                </p>
                <p className="mt-0.5 truncate text-base text-muted">
                  {actorLabel(log.actor)}
                  {log.targetUser ? `, ${actorLabel(log.targetUser)}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-base text-muted-2">
                {formatWhen(log.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
