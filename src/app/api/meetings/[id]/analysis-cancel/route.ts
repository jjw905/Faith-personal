import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { requestAnalysisCancellation } from "@/lib/stt/analysis-job-queue";
import { getUserMeeting, updateUserMeeting } from "@/lib/user-meetings-store";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const meeting = await getUserMeeting(id);
  if (!meeting || meeting.userId !== session.user.id) {
    return NextResponse.json(
      { ok: false, message: "회의 없음" },
      { status: 404 },
    );
  }

  const job = await requestAnalysisCancellation({
    meetingId: id,
    userId: session.user.id,
  });
  if (!job) {
    return NextResponse.json(
      {
        ok: false,
        message: "이 분석은 취소 가능한 큐 작업이 아닙니다.",
      },
      { status: 409 },
    );
  }

  if (job.status === "CANCELED") {
    // 아직 모델 호출 전에 취소된 대기 작업은 할당량을 쓰지 않는다.
    await prisma.analysisUsage.updateMany({
      where: { meetingId: id, status: "RESERVED" },
      data: { status: "RELEASED" },
    });
    await updateUserMeeting(id, {
      phase: "error",
      stageLabel: undefined,
      errorMessage: "분석을 시작하기 전에 취소했습니다. 사용 시간은 차감되지 않습니다.",
    });
  } else if (job.status === "RUNNING") {
    await updateUserMeeting(id, {
      stageLabel: "취소 요청을 확인하는 중이에요",
    });
  }

  return NextResponse.json({
    ok: true,
    status: job.status.toLowerCase(),
    cancelPending: job.status === "RUNNING",
    message:
      job.status === "RUNNING"
        ? "현재 호출을 중단하고 안전하게 정리하고 있습니다."
        : "분석을 취소했습니다.",
  });
}
