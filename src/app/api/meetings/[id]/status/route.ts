import { NextResponse } from "next/server";

import { canReadMeeting } from "@/lib/meeting-access";
import { requireUser } from "@/lib/require-user";
import { meetingDisplayTitle } from "@/lib/meeting-process";
import {
  getUserMeeting,
} from "@/lib/user-meetings-store";
import { analysisJobForMeeting } from "@/lib/stt/analysis-job-queue";
import {
  getTeamFeatureAccess,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const { id } = await params;
  // 상태 조회(GET)는 절대 살아 있는 분석을 실패로 바꾸지 않는다. Worker의
  // heartbeat/상태 전이가 유일한 작업 생명주기 근거다.
  const row = await getUserMeeting(id);
  if (!row || row.userId !== session.user.id) {
    return NextResponse.json(
      { ok: false, message: "회의 없음" },
      { status: 404 },
    );
  }

  const job = await analysisJobForMeeting(id);
  const activityAt = job?.lockedAt ?? new Date(row.updatedAt);
  const createdAt = job?.createdAt ?? new Date(row.createdAt);
  const now = Date.now();
  const activityAgeSec = Math.max(
    0,
    Math.round((now - activityAt.getTime()) / 1_000),
  );
  const elapsedSec = Math.max(
    0,
    Math.round((now - createdAt.getTime()) / 1_000),
  );
  const cancelPending = Boolean(job?.cancelRequestedAt) && job?.status === "RUNNING";
  if (row.workspace === "team") {
    const teamFeature = await getTeamFeatureAccess(session.user.id);
    if (!teamFeature.ok) return teamFeatureFailureResponse(teamFeature);
    const access = await canReadMeeting(id, session.user.id);
    if (!access.allowed) {
      return NextResponse.json(
        { ok: false, message: "팀 회의 접근 권한이 없습니다." },
        { status: 403 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    meetingId: row.id,
    phase: row.phase,
    progressPercent:
      typeof row.progressPercent === "number"
        ? row.progressPercent
        : row.phase === "structuring"
          ? 72
          : row.phase === "transcribing"
            ? 1
            : row.phase === "done"
              ? 100
              : 0,
    errorMessage: row.errorMessage ?? null,
    stageLabel: cancelPending
      ? "취소 요청을 확인하는 중이에요"
      : row.stageLabel ?? null,
    jobStatus: job?.status?.toLowerCase() ?? null,
    canCancel: job?.status === "QUEUED" || job?.status === "RUNNING",
    cancelPending,
    activityAt: activityAt.toISOString(),
    activityAgeSec,
    elapsedSec,
    activityState:
      job?.status === "QUEUED"
        ? "waiting"
        : job?.status === "RUNNING" && activityAgeSec <= 90
          ? "active"
          : row.phase === "transcribing" || row.phase === "structuring"
            ? "checking"
            : "idle",
    title: meetingDisplayTitle({ title: row.meeting.title }),
    href: `/meetings/${row.id}`,
  });
}
