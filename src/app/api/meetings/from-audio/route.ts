import { randomUUID } from "crypto";
import { after, NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { enqueueAnalysisJob } from "@/lib/stt/analysis-job-queue";
import {
  ANALYSIS_MODE_POLICY,
} from "@/lib/stt/analysis-mode";
import { processUploadedMeeting } from "@/lib/stt/process-upload";
import { placeholderMeeting } from "@/lib/stt/to-meeting";
import { stripFileExtension } from "@/lib/meeting-process";
import { resolveAnalysisModeForEntitlement } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { protectUserFileForTeam } from "@/lib/storage/vault-service";
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
  const useAnalysisQueue =
    process.env.ANALYSIS_EXECUTION_MODE?.trim().toLowerCase() === "queue";
  if (process.env.NODE_ENV === "production" && !useAnalysisQueue) {
    console.error(
      "[analysis] production runtime must use ANALYSIS_EXECUTION_MODE=queue",
    );
    return NextResponse.json(
      {
        ok: false,
        message: "분석을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
      },
      { status: 503 },
    );
  }
  if (!useAnalysisQueue) {
    console.warn(
      "[analysis] local inline execution; use the staging URL to use Cloud Run workers",
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
  // 요금제 정책은 클라이언트 선택값을 신뢰하지 않는다. Pro/Team/Admin과
  // 팀 워크스페이스는 항상 precision(화자 구분)으로 고정하고, Free만
  // standard(빠른 정리)를 사용한다.
  const analysisMode = resolveAnalysisModeForEntitlement(
    session.user.plan,
    session.user.role,
    workspace,
  );
  const policy = ANALYSIS_MODE_POLICY[analysisMode];
  const model = policy.model;
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
  if (workspace === "team" && teamId && teamMember) {
    try {
      await protectUserFileForTeam({
        userId: session.user.id,
        fileId: vaultFileId,
        teamId,
      });
    } catch (error) {
      console.error("[team-encryption] 원본 파일 보호 실패", {
        meetingId: vaultFileId,
        message: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        {
          ok: false,
          message:
            "팀 회의 원본을 보호하지 못했습니다. 팀 보안 키와 저장소 설정을 확인해 주세요.",
        },
        { status: 503 },
      );
    }
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
    progressPercent: 1,
    createdAt: now,
    updatedAt: now,
    workspace,
    meeting: placeholder.meeting,
    transcript: placeholder.transcript,
    timeline: placeholder.timeline,
  };
  await saveUserMeeting(record, { teamId });

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

  if (useAnalysisQueue) {
    try {
      await updateUserMeeting(meetingId, {
        stageLabel: "잠시 기다리는 중이에요",
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
    executionMode: useAnalysisQueue ? "queue" : "inline",
    href: `/meetings/${meetingId}`,
  });
}
