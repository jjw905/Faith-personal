import { randomUUID } from "crypto";
import { after, NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { enqueueAnalysisJob } from "@/lib/stt/analysis-job-queue";
import {
  ANALYSIS_MODE_POLICY,
  parseAnalysisMode,
} from "@/lib/stt/analysis-mode";
import { processUploadedMeeting } from "@/lib/stt/process-upload";
import { placeholderMeeting } from "@/lib/stt/to-meeting";
import { stripFileExtension } from "@/lib/meeting-process";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  getUploadQuotaStatus,
  UploadQuotaExceededError,
} from "@/lib/stt/usage-quota";
import {
  saveUserMeeting,
  updateUserMeeting,
  type UserMeetingRecord,
} from "@/lib/user-meetings-store";
import type { WorkspaceId } from "@/lib/workspaces";
import { requireTeamCapability, writeTeamAudit } from "@/lib/team-permissions";
import {
  getTeamFeatureAccess,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

export async function POST(request: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const startLimit = rateLimit({
    key: `upload-analysis:${session.user.id}:${clientIp(request)}`,
    limit: 20,
    windowMs: 60 * 60_000,
  });
  if (!startLimit.ok) return rateLimitResponse(startLimit.retryAfterSec);

  let body: {
    vaultFileId?: string;
    title?: string;
    workspace?: string;
    teamId?: string;
    mode?: "ONLINE" | "OFFLINE";
    analysisMode?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const vaultFileId = body.vaultFileId?.trim();
  if (!vaultFileId) {
    return NextResponse.json(
      { ok: false, message: "vaultFileId가 필요합니다." },
      { status: 400 },
    );
  }

  // 클라이언트는 공개된 분석 모드만 고른다. 실제 모델과 비용 경로는 서버가
  // 고정해 임의의 비싼 모델명 주입이나 차감 우회를 막는다.
  const analysisMode = parseAnalysisMode(body.analysisMode);
  const policy = ANALYSIS_MODE_POLICY[analysisMode];
  const model = policy.model;

  const file = await prisma.vaultFile.findFirst({
    where: { id: vaultFileId, userId: session.user.id },
  });
  if (!file) {
    return NextResponse.json(
      { ok: false, message: "파일을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  // 길이는 ffprobe 이후에 최종 검사한다. 남은 시간이 이미 0이면
  // placeholder 회의를 만들지 않고 여기서 막는다(비동기 실패 잔존 방지).
  const quota = await getUploadQuotaStatus(session.user.id);
  if (quota.enforced && quota.remainingSec <= 0) {
    const err = new UploadQuotaExceededError(quota);
    return NextResponse.json(
      {
        ok: false,
        code: "UPLOAD_QUOTA_EXCEEDED",
        message: err.message,
        quota: {
          usedSec: quota.usedSec,
          limitSec: quota.limitSec,
          remainingSec: quota.remainingSec,
          surveyCompleted: quota.surveyCompleted,
          resetsAtLabel: quota.resetsAtLabel,
          enforced: quota.enforced,
        },
      },
      { status: 429 },
    );
  }

  const title =
    body.title?.trim() ||
    stripFileExtension(file.name) ||
    "업로드 회의";
  const workspace: WorkspaceId =
    body.workspace === "team" ? "team" : "personal";
  const teamId = body.teamId?.trim();
  if (workspace === "team") {
    const teamFeature = await getTeamFeatureAccess(session.user.id);
    if (!teamFeature.ok) return teamFeatureFailureResponse(teamFeature);
  }
  const teamMember =
    workspace === "team" && teamId
      ? await requireTeamCapability(
          teamId,
          session.user.id,
          "createMeeting",
        )
      : null;
  if (workspace === "team" && (!teamId || !teamMember)) {
    return NextResponse.json(
      { ok: false, message: "팀 회의 생성 권한이 없습니다." },
      { status: 403 },
    );
  }

  const meetingId = `mtg-up-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const placeholder = placeholderMeeting({
    meetingId,
    title,
    workspace,
    date: now,
    capture: "upload",
  });
  const record: UserMeetingRecord = {
    id: meetingId,
    userId: session.user.id,
    vaultFileId,
    model,
    analysisMode,
    phase: "transcribing",
    progressPercent: 0,
    createdAt: now,
    updatedAt: now,
    workspace,
    meeting: placeholder.meeting,
    transcript: placeholder.transcript,
    timeline: placeholder.timeline,
  };
  await saveUserMeeting(record);

  if (teamId && teamMember) {
    await prisma.teamMeeting.create({
      data: {
        teamId,
        legacyMeetingId: meetingId,
        title,
        mode: "ONLINE",
        state: "PROCESSING",
        createdById: session.user.id,
        organizerId: session.user.id,
        currentHostId: session.user.id,
        livekitRoomName: null,
        access: {
          create: {
            userId: session.user.id,
            isParticipant: true,
            canReadMasked: true,
            grantedById: session.user.id,
            acknowledgedAt: new Date(),
          },
        },
      },
    });
    await writeTeamAudit({
      teamId,
      actorId: session.user.id,
      meetingId,
      action: "meeting.created_from_audio",
      metadata: { mode: "ONLINE" },
      request,
    });
  }

  if (process.env.ANALYSIS_EXECUTION_MODE === "queue") {
    try {
      await updateUserMeeting(meetingId, {
        stageLabel: "분석 대기 중",
      });
      await enqueueAnalysisJob({
        meetingId,
        userId: session.user.id,
        vaultFileId,
        analysisMode,
        title,
      });
    } catch (error) {
      await updateUserMeeting(meetingId, {
        phase: "error",
        errorMessage: "분석 대기열에 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      });
      console.error("[analysis-queue] 업로드 작업 등록 실패", error);
      return NextResponse.json(
        { ok: false, message: "분석 대기열에 등록하지 못했습니다." },
        { status: 503 },
      );
    }
  } else {
    after(() =>
      processUploadedMeeting({
        meetingId,
        userId: session.user.id,
        vaultFileId,
        analysisMode,
        title,
      }),
    );
  }

  return NextResponse.json({
    ok: true,
    meetingId,
    phase: "transcribing",
    href: `/meetings/${meetingId}`,
  });
}
