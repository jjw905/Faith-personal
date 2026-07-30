import { randomUUID } from "crypto";
import { after, NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { parseAccountDisplayPrefs } from "@/lib/account-settings";
import { DEFAULT_STT_MODEL } from "@/lib/stt/models";
import { processUploadedMeeting } from "@/lib/stt/process-upload";
import { placeholderMeeting } from "@/lib/stt/to-meeting";
import { stripFileExtension } from "@/lib/meeting-process";
import { prisma } from "@/lib/prisma";
import {
  getUploadQuotaStatus,
  UploadQuotaExceededError,
} from "@/lib/stt/usage-quota";
import {
  saveUserMeeting,
  type UserMeetingRecord,
} from "@/lib/user-meetings-store";
import type { WorkspaceId } from "@/lib/workspaces";
import { requireTeamCapability, writeTeamAudit } from "@/lib/team-permissions";

export async function POST(request: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  let body: {
    vaultFileId?: string;
    title?: string;
    workspace?: string;
    teamId?: string;
    mode?: "ONLINE" | "OFFLINE";
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

  // 업로드 회의 STT는 mini로 고정. 클라이언트 model은 무시.
  const model = DEFAULT_STT_MODEL;

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
    phase: "transcribing",
    progressPercent: 0,
    createdAt: now,
    updatedAt: now,
    workspace,
    meeting: placeholder.meeting,
    transcript: placeholder.transcript,
    timeline: placeholder.timeline,
  };
  saveUserMeeting(record);

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

  const personalSettings = await prisma.userPersonalSettings.findUnique({
    where: { userId: session.user.id },
    select: { displayPrefs: true },
  });
  const { speakerSplit } = parseAccountDisplayPrefs(
    personalSettings?.displayPrefs,
  );

  after(() =>
    processUploadedMeeting({
      meetingId,
      userId: session.user.id,
      vaultFileId,
      model,
      title,
      speakerSplit,
    }),
  );

  return NextResponse.json({
    ok: true,
    meetingId,
    phase: "transcribing",
    href: `/meetings/${meetingId}`,
  });
}
