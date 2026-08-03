import { after, NextResponse } from "next/server";

import { auth } from "@/auth";
import { writeAdminAudit } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";
import { enqueueAnalysisJob } from "@/lib/stt/analysis-job-queue";
import { processUploadedMeeting } from "@/lib/stt/process-upload";
import { getUserMeeting, updateUserMeeting } from "@/lib/user-meetings-store";

export const dynamic = "force-dynamic";

/**
 * 개인정보보호법 제37조의2 대응: 이용자가 자동 검열 차단에 이의를
 * 제기하면, 운영자는 회의 본문을 읽지 않고도 이 조치로 자동 차단을
 * 적용하지 않고 파이프라인을 다시 돌릴 수 있다. 반드시 해당 이용자의
 * 명시적 이의제기(문의 접수)가 있을 때만 사용해야 하며, 그 사실을
 * 감사 로그에 남긴다.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabled: true },
  });
  if (!dbUser || dbUser.disabled || dbUser.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
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
        error: "분석을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.",
      },
      { status: 503 },
    );
  }

  let body: { meetingId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const meetingId = body.meetingId?.trim();
  if (!meetingId) {
    return NextResponse.json(
      { ok: false, error: "meetingId가 필요합니다." },
      { status: 400 },
    );
  }

  const record = await getUserMeeting(meetingId);
  if (!record || !record.vaultFileId) {
    return NextResponse.json(
      { ok: false, error: "다시 처리할 원본 파일을 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  await writeAdminAudit({
    actorId: session.user.id,
    targetUserId: record.userId,
    action: "moderation.reprocess",
    metadata: { meetingId },
    request,
  });

  await updateUserMeeting(meetingId, {
    phase: "transcribing",
    progressPercent: 1,
    stageLabel: "이의제기 재처리 대기 중",
    errorMessage: undefined,
  });

  if (useAnalysisQueue) {
    try {
      await enqueueAnalysisJob({
        meetingId,
        userId: record.userId,
        vaultFileId: record.vaultFileId,
        analysisMode: record.analysisMode,
        title: record.meeting.title,
        bypassModeration: true,
        force: true,
      });
    } catch (error) {
      console.error("[analysis-queue] 재처리 작업 등록 실패", error);
      return NextResponse.json(
        { ok: false, error: "재처리 대기열에 등록하지 못했습니다." },
        { status: 503 },
      );
    }
  } else {
    after(() =>
      processUploadedMeeting({
        meetingId,
        userId: record.userId,
        vaultFileId: record.vaultFileId!,
        analysisMode: record.analysisMode,
        title: record.meeting.title,
        bypassModeration: true,
      }),
    );
  }

  return NextResponse.json({ ok: true, meetingId });
}
