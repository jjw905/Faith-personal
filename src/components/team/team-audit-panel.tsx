"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { useTeamRolePreview } from "@/context/team-role-preview-context";
import { cn } from "@/lib/utils";

type AuditLog = {
  id: string;
  action: string;
  createdAt: string;
  actor: { id: string; name: string | null; handle: string | null } | null;
  targetUser: { id: string; name: string | null; handle: string | null } | null;
};

const PAGE_AUDIT = 12;

const CARD_SHADOW =
  "panel-surface rounded-2xl";

/** 짧은 한글 라벨. 없으면 action 그대로. */
const ACTION_LABEL: Record<string, string> = {
  "team.created": "팀 생성",
  "team.renamed": "팀 이름 변경",
  "team.policy_updated": "정책 변경",
  "invite.created": "초대 발송",
  "invite.accepted": "초대 수락",
  "invite.declined": "초대 거절",
  "invite.canceled": "초대 취소",
  "member.permissions_updated": "권한 변경",
  "member.removed": "멤버 제거",
  "member.left": "멤버 탈퇴",
  "meeting.scheduled": "회의 예약",
  "meeting.started": "회의 시작",
  "meeting.ended": "회의 종료",
  "meeting.canceled": "회의 취소",
  "meeting.rescheduled": "일정 변경",
  "meeting.host_transferred": "호스트 이전",
  "meeting.participant_removed": "참가자 제거",
  "meeting.access_granted": "기록 열람 허용",
  "meeting.access_revoked": "기록 열람 해제",
  "meeting.access_bulk_updated": "기록 열람 일괄",
  "meeting.recording_started": "기록 시작",
  "meeting.recording_stopped": "기록 중지",
  "meeting.recording_start_unavailable": "기록 시작 불가",
  "meeting.created_from_audio": "업로드 회의",
  "meeting.closed_organizer_absent": "회의 종료",
  "announcement.created": "공지 등록",
  "announcement.updated": "공지 수정",
  "audit.viewed": "감사 로그 열람",
  MEMBER_INVITED: "초대 발송",
  MEETING_CREATED: "회의 생성",
};

function actionLabel(action: string) {
  return ACTION_LABEL[action] ?? action;
}

function personLabel(
  person: AuditLog["actor"] | AuditLog["targetUser"],
): string {
  if (!person) return "시스템";
  return person.name || person.handle || "사용자";
}

function dateKey(value: string) {
  const d = new Date(value);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDateGroup(value: string) {
  return new Date(value).toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  hideAllShown = false,
}: {
  total: number;
  visible: number;
  pageSize: number;
  onMore: () => void;
  onCollapse: () => void;
  hideAllShown?: boolean;
}) {
  if (total <= pageSize) return null;

  const shown = Math.min(visible, total);
  const hasMore = shown < total;
  const remaining = total - shown;
  const expanded = visible > pageSize;

  return (
    <div className="flex flex-col items-stretch gap-2 border-t border-border px-6 py-4 sm:items-center">
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
        ) : hideAllShown ? null : (
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

export function TeamAuditPanel() {
  const { activeTeamId } = useAppContext();
  const { scenarioId } = usePageUxPreview();
  const { previewRole, isPreviewing } = useTeamRolePreview();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
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
        nextCursor?: string | null;
        retentionDays?: number;
        message?: string;
      };
      if (!response.ok || !data.ok) {
        setLogs([]);
        setNextCursor(null);
        setMessage(
          data.message ??
            (response.status === 403
              ? "감사 로그는 팀 대표만 볼 수 있습니다."
              : "감사 로그를 불러오지 못했습니다."),
        );
        return;
      }
      setLogs(data.logs ?? []);
      setNextCursor(data.nextCursor ?? null);
      setRetentionDays(data.retentionDays ?? null);
    } catch {
      setLogs([]);
      setNextCursor(null);
      setMessage("감사 로그를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(
    async (teamId: string, cursor: string) => {
      setLoadingMore(true);
      try {
        const response = await fetch(
          `/api/teams/${teamId}/audit?cursor=${encodeURIComponent(cursor)}`,
          { cache: "no-store" },
        );
        const data = (await response.json()) as {
          ok?: boolean;
          logs?: AuditLog[];
          nextCursor?: string | null;
        };
        if (!response.ok || !data.ok) return;
        setLogs((current) => [...current, ...(data.logs ?? [])]);
        setNextCursor(data.nextCursor ?? null);
      } finally {
        setLoadingMore(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!activeTeamId) {
      queueMicrotask(() => {
        setLoading(false);
        setLogs([]);
        setNextCursor(null);
        setMessage("팀을 먼저 선택하세요.");
      });
      return;
    }
    queueMicrotask(() => void load(activeTeamId));
  }, [activeTeamId, load]);

  const viewLogs = useMemo(() => {
    if (scenarioId === "empty") return [] as AuditLog[];
    if (scenarioId === "full") {
      if (logs.length > 0) return logs;
      return Array.from({ length: 24 }, (_, index) => ({
        id: `ux-audit-${index + 1}`,
        action: index % 2 === 0 ? "invite.created" : "meeting.scheduled",
        createdAt: new Date(
          Date.now() - index * 5 * 3600_000,
        ).toISOString(),
        actor: {
          id: "ux-actor",
          name: "관리자",
          handle: "admin",
        },
        targetUser:
          index % 3 === 0
            ? { id: "ux-target", name: "팀원", handle: "member" }
            : null,
      }));
    }
    return logs;
  }, [logs, scenarioId]);

  const listPage = useListPage(
    PAGE_AUDIT,
    `${activeTeamId ?? ""}|${scenarioId}`,
  );

  const visibleLogs = viewLogs.slice(0, listPage.visible);
  const allLoadedVisible =
    viewLogs.length > 0 && listPage.visible >= viewLogs.length;
  const canFetchOlder =
    Boolean(nextCursor && activeTeamId && scenarioId === "live") &&
    allLoadedVisible;

  const groups = useMemo(() => {
    const map = new Map<string, AuditLog[]>();
    for (const log of visibleLogs) {
      const key = dateKey(log.createdAt);
      const bucket = map.get(key);
      if (bucket) bucket.push(log);
      else map.set(key, [log]);
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      label: formatDateGroup(items[0]!.createdAt),
      items,
    }));
  }, [visibleLogs]);

  if (
    (loading && scenarioId === "live" && !previewDenied) ||
    scenarioId === "loading"
  ) {
    return (
      <div className={cn("grid min-h-56 place-items-center bg-card", CARD_SHADOW)}>
        <LoaderCircle
          className="h-6 w-6 animate-spin text-muted"
          aria-label="불러오는 중"
        />
      </div>
    );
  }

  if ((message && scenarioId === "live") || previewDenied) {
    return (
      <div
        className={cn(
          "grid min-h-56 place-items-center bg-card p-6 text-center",
          CARD_SHADOW,
        )}
      >
        <p className="text-base text-muted">
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

  return (
    <section className={cn("overflow-hidden bg-card", CARD_SHADOW)}>
      <div className="space-y-0 px-6 pb-0 pt-6">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          최근 이벤트
        </h2>
        {retentionDays ? (
          <p className="mt-1.5 text-base font-medium text-muted">
            {retentionDays}일 보관
          </p>
        ) : null}
        <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
      </div>

      {viewLogs.length === 0 ? (
        <p className="px-6 py-10 text-center text-base text-muted">
          기록이 없습니다.
        </p>
      ) : (
        <>
          <div className="pb-1">
            {groups.map((group) => (
              <div key={group.key}>
                <div className="sticky top-0 z-[1] bg-surface/95 px-6 py-2.5 backdrop-blur-sm">
                  <p className="text-base font-semibold text-foreground">
                    {group.label}
                  </p>
                </div>
                <ul className="divide-y divide-border">
                  {group.items.map((log) => (
                    <li
                      key={log.id}
                      className="grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-6 py-3.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-lg font-semibold text-foreground">
                          {actionLabel(log.action)}
                        </p>
                        <p className="mt-0.5 truncate text-base text-muted">
                          {personLabel(log.actor)}
                          {log.targetUser
                            ? `, ${personLabel(log.targetUser)}`
                            : ""}
                        </p>
                      </div>
                      <time
                        dateTime={log.createdAt}
                        className="shrink-0 text-base tabular-nums text-muted-2"
                      >
                        {formatTime(log.createdAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <ListPager
            total={viewLogs.length}
            visible={listPage.visible}
            pageSize={PAGE_AUDIT}
            onMore={() => listPage.showMore(viewLogs.length)}
            onCollapse={listPage.collapse}
            hideAllShown={Boolean(nextCursor && scenarioId === "live")}
          />
          {canFetchOlder ? (
            <div className="border-t border-border px-6 py-4">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => {
                  if (!activeTeamId || !nextCursor) return;
                  void loadMore(activeTeamId, nextCursor).then(() => {
                    listPage.showMore(Number.MAX_SAFE_INTEGER);
                  });
                }}
                className="mx-auto flex h-12 min-w-12 items-center justify-center rounded-full border border-border-strong bg-surface px-5 text-base font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50"
              >
                {loadingMore ? "불러오는 중…" : "이전 기록"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
