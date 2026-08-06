import { AnalysisJobStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import {
  meetingDisplayTitle,
  meetingProcessDetail,
} from "@/lib/meeting-process";
import { parseDataRetentionDays } from "@/lib/data-retention";
import { getMeetingsForUser } from "@/lib/meetings-data";
import { prisma } from "@/lib/prisma";
import {
  listUserMeetings,
  purgeExpiredUserMeetings,
  type UserMeetingRecord,
} from "@/lib/user-meetings-store";
import type { WorkspaceId } from "@/lib/workspaces";
import {
  getTeamFeatureAccess,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

const DONE_ACTIVITY_LIMIT = 12;

type QueueJobMeta = {
  jobStatus: "queued" | "running" | null;
  /** 같은 사용자 대기열에서 앞에 남은 건수(본인 제외). 0이면 다음 차례. */
  queueAhead: number | null;
};

function relativeTimeLabel(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

function isActivePhase(phase: UserMeetingRecord["phase"]) {
  return phase === "transcribing" || phase === "structuring";
}

function toActivityItem(
  row: UserMeetingRecord,
  vaultNames: Map<string, string>,
  queueMeta?: QueueJobMeta,
) {
  const active = isActivePhase(row.phase);
  const status =
    row.phase === "transcribing"
      ? ("transcribing" as const)
      : row.phase === "structuring"
        ? ("structuring" as const)
        : row.phase === "error"
          ? ("error" as const)
          : row.phase === "empty"
            ? ("empty" as const)
            : ("done" as const);
  const title = meetingDisplayTitle({
    title: row.meeting.title,
    vaultFileName: row.vaultFileId
      ? vaultNames.get(row.vaultFileId)
      : undefined,
  });
  const waiting =
    active &&
    (queueMeta?.jobStatus === "queued" ||
      /기다리/.test(row.stageLabel ?? "") ||
      (typeof row.progressPercent === "number" &&
        row.progressPercent <= 1 &&
        row.phase === "transcribing" &&
        queueMeta?.jobStatus !== "running"));
  const detail = active
    ? waiting
      ? row.stageLabel?.trim() || "잠시 기다리는 중이에요"
      : row.stageLabel?.trim() ||
        meetingProcessDetail(row.phase, row.errorMessage)
    : meetingProcessDetail(row.phase, row.errorMessage);
  return {
    id: row.id,
    title,
    fileName: title,
    status,
    phase: row.phase,
    progressPercent:
      typeof row.progressPercent === "number"
        ? row.progressPercent
        : active
          ? waiting
              ? 1
            : row.phase === "structuring"
              ? 72
              : 1
          : row.phase === "error" || row.phase === "empty"
            ? 0
            : 100,
    detail,
    time: relativeTimeLabel(row.updatedAt || row.createdAt),
    href: `/meetings/${row.id}`,
    workspace: row.workspace,
    jobStatus: queueMeta?.jobStatus ?? null,
    queueAhead: waiting ? (queueMeta?.queueAhead ?? null) : null,
    waiting: Boolean(waiting),
  };
}

export async function GET(request: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const workspace = (
    url.searchParams.get("workspace") === "team" ? "team" : "personal"
  ) as WorkspaceId;
  if (workspace === "team") {
    const teamFeature = await getTeamFeatureAccess(session.user.id);
    if (!teamFeature.ok) return teamFeatureFailureResponse(teamFeature);
  }

  // 알림 목록과 같은 패턴: 조회 전 보존 기간이 지난 개인 회의 기록을 지연 삭제한다.
  // 이미 사용자가 고지·선택한 기간을 적용하는 것이라, 기간을 "줄일 때"의 확인 다이얼로그와는 별개다.
  let purgedCount = 0;
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { meetingRetentionDays: true },
  });
  if (account) {
    const result = await purgeExpiredUserMeetings(
      session.user.id,
      parseDataRetentionDays(account.meetingRetentionDays),
    );
    purgedCount = result.deleted;
  }

  let meetings = await getMeetingsForUser(session.user.id, workspace);
  let inWorkspace = (await listUserMeetings(session.user.id)).filter(
    (r) => r.workspace === workspace,
  );
  if (workspace === "team" && inWorkspace.length > 0) {
    const ids = inWorkspace.map((row) => row.id);
    const accessibleTeamMeetings = await prisma.teamMeeting.findMany({
      where: {
        OR: [
          { id: { in: ids } },
          { legacyMeetingId: { in: ids } },
        ],
        team: { members: { some: { userId: session.user.id } } },
      },
      select: { id: true, legacyMeetingId: true },
    });
    const accessibleIds = new Set(
      accessibleTeamMeetings.flatMap((meeting) =>
        [meeting.id, meeting.legacyMeetingId].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    );
    inWorkspace = inWorkspace.filter((row) => accessibleIds.has(row.id));
    const userMeetingIds = new Set(
      (await listUserMeetings(session.user.id))
        .filter((row) => row.workspace === workspace)
        .map((row) => row.id),
    );
    meetings = meetings.filter(
      (meeting) =>
        !userMeetingIds.has(meeting.id) || accessibleIds.has(meeting.id),
    );
  }
  const activeRows = inWorkspace.filter((r) => isActivePhase(r.phase));
  const settledRows = inWorkspace
    .filter((r) => !isActivePhase(r.phase))
    .slice(0, DONE_ACTIVITY_LIMIT);
  const rows = [...activeRows, ...settledRows];

  const vaultIds = [
    ...new Set(
      rows
        .map((r) => r.vaultFileId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const vaultNames = new Map<string, string>();
  if (vaultIds.length > 0) {
    const files = await prisma.vaultFile.findMany({
      where: { id: { in: vaultIds }, userId: session.user.id },
      select: { id: true, name: true },
    });
    for (const f of files) vaultNames.set(f.id, f.name);
  }

  /** 활성 회의의 잡 상태·대기 순위 (같은 사용자 순차 처리 기준). */
  const queueMetaByMeeting = new Map<string, QueueJobMeta>();
  if (activeRows.length > 0) {
    const openJobs = await prisma.analysisJob.findMany({
      where: {
        userId: session.user.id,
        status: {
          in: [AnalysisJobStatus.QUEUED, AnalysisJobStatus.RUNNING],
        },
      },
      select: {
        meetingId: true,
        status: true,
        availableAt: true,
        createdAt: true,
      },
      orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    });
    const activeIdSet = new Set(activeRows.map((row) => row.id));
    const runningCount = openJobs.filter(
      (job) => job.status === AnalysisJobStatus.RUNNING,
    ).length;
    let queuedBefore = 0;
    for (const job of openJobs) {
      if (job.status === AnalysisJobStatus.RUNNING) {
        if (activeIdSet.has(job.meetingId)) {
          queueMetaByMeeting.set(job.meetingId, {
            jobStatus: "running",
            queueAhead: null,
          });
        }
        continue;
      }
      const ahead = runningCount + queuedBefore;
      if (activeIdSet.has(job.meetingId)) {
        queueMetaByMeeting.set(job.meetingId, {
          jobStatus: "queued",
          queueAhead: ahead,
        });
      }
      queuedBefore += 1;
    }
  }

  const activity = rows.map((row) =>
    toActivityItem(row, vaultNames, queueMetaByMeeting.get(row.id)),
  );

  const meetingsWithProcess = meetings.map((meeting) => {
    if (meeting.status !== "in_progress") return meeting;
    const meta = queueMetaByMeeting.get(meeting.id);
    const row = activeRows.find((r) => r.id === meeting.id);
    if (!meta && !row) return meeting;
    const phase =
      meeting.process?.phase ??
      (row?.phase === "structuring" ? "structuring" : "transcribing");
    const waiting =
      meta?.jobStatus === "queued" ||
      /기다리/.test(row?.stageLabel ?? meeting.process?.stageLabel ?? "") ||
      (typeof (meeting.process?.progressPercent ?? row?.progressPercent) ===
        "number" &&
        (meeting.process?.progressPercent ?? row?.progressPercent ?? 0) <= 1 &&
        phase === "transcribing" &&
        meta?.jobStatus !== "running");
    return {
      ...meeting,
      process: {
        phase,
        progressPercent:
          meeting.process?.progressPercent ??
          (typeof row?.progressPercent === "number"
            ? row.progressPercent
            : phase === "structuring"
              ? 72
              : 1),
        stageLabel:
          meeting.process?.stageLabel ?? row?.stageLabel ?? null,
        waiting: Boolean(waiting),
        jobStatus: meta?.jobStatus ?? meeting.process?.jobStatus ?? null,
        queueAhead: waiting
          ? (meta?.queueAhead ?? meeting.process?.queueAhead ?? null)
          : null,
      },
    };
  });

  meetingsWithProcess.sort((a, b) => {
    const aActive = a.status === "in_progress" ? 0 : 1;
    const bActive = b.status === "in_progress" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    if (aActive === 0) {
      const aw = a.process?.waiting ? 1 : 0;
      const bw = b.process?.waiting ? 1 : 0;
      if (aw !== bw) return aw - bw;
      if (aw === 1) {
        return (a.process?.queueAhead ?? 99) - (b.process?.queueAhead ?? 99);
      }
      return (
        (b.process?.progressPercent ?? 0) - (a.process?.progressPercent ?? 0)
      );
    }
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return NextResponse.json({
    ok: true,
    meetings: meetingsWithProcess,
    activity,
    purgedCount,
  });
}
