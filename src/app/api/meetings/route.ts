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
  const detail = active
    ? row.stageLabel?.trim() || meetingProcessDetail(row.phase, row.errorMessage)
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
          ? row.phase === "structuring"
            ? 72
            : 4
          : row.phase === "error" || row.phase === "empty"
            ? 0
            : 100,
    detail,
    time: relativeTimeLabel(row.updatedAt || row.createdAt),
    href: `/meetings/${row.id}`,
    workspace: row.workspace,
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

  const activity = rows.map((row) => toActivityItem(row, vaultNames));

  return NextResponse.json({ ok: true, meetings, activity, purgedCount });
}
