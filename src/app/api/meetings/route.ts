import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import {
  meetingDisplayTitle,
  meetingProcessDetail,
} from "@/lib/meeting-process";
import { getMeetingsForUser } from "@/lib/meetings-data";
import { prisma } from "@/lib/prisma";
import {
  listUserMeetings,
  type UserMeetingRecord,
} from "@/lib/user-meetings-store";
import type { WorkspaceId } from "@/lib/workspaces";

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
          : ("done" as const);
  const title = meetingDisplayTitle({
    title: row.meeting.title,
    vaultFileName: row.vaultFileId
      ? vaultNames.get(row.vaultFileId)
      : undefined,
  });
  const detail = meetingProcessDetail(row.phase, row.errorMessage);
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
          : row.phase === "error"
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

  const meetings = getMeetingsForUser(session.user.id, workspace);
  const inWorkspace = listUserMeetings(session.user.id).filter(
    (r) => r.workspace === workspace,
  );
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

  return NextResponse.json({ ok: true, meetings, activity });
}
