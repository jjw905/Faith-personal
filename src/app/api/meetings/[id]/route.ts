import { NextResponse } from "next/server";

import { normalizeMeetingDateIso } from "@/lib/meeting-date";
import { canReadMeeting } from "@/lib/meeting-access";
import { renameParticipantInRecord } from "@/lib/rename-meeting-participant";
import { requireUser } from "@/lib/require-user";
import { applyLineCorrection, setLineMemo } from "@/lib/transcript-line-edit";
import {
  deleteUserMeeting,
  getUserMeeting,
  updateUserMeeting,
} from "@/lib/user-meetings-store";
import {
  getTeamFeatureAccess,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type Params = { params: Promise<{ id: string }> };

type PatchBody = {
  title?: string;
  date?: string;
  renameParticipant?: { id?: string; name?: string };
  applyCorrection?: {
    lineId?: string;
    wrong?: string;
    suggestion?: string;
    startOffset?: number;
    endOffset?: number;
  };
  setMemo?: { lineId?: string; memo?: string };
};

export async function PATCH(request: Request, { params }: Params) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const row = getUserMeeting(id);
  if (!row || row.userId !== session.user.id) {
    return NextResponse.json(
      { ok: false, message: "회의 없음" },
      { status: 404 },
    );
  }
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

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  if (body.renameParticipant) {
    const participantId =
      typeof body.renameParticipant.id === "string"
        ? body.renameParticipant.id.trim()
        : "";
    const name =
      typeof body.renameParticipant.name === "string"
        ? body.renameParticipant.name
        : "";
    if (!participantId) {
      return NextResponse.json(
        { ok: false, message: "참석자 id가 필요합니다." },
        { status: 400 },
      );
    }
    const renamed = renameParticipantInRecord(row, participantId, name);
    if (!renamed.ok) {
      return NextResponse.json(
        { ok: false, message: renamed.message },
        { status: 400 },
      );
    }
    const next = updateUserMeeting(id, {
      meeting: renamed.record.meeting,
      transcript: renamed.record.transcript,
      timeline: renamed.record.timeline,
      semantic: renamed.record.semantic,
    });
    return NextResponse.json({ ok: true, meeting: next?.meeting });
  }

  if (body.applyCorrection) {
    const { lineId, wrong, suggestion, startOffset, endOffset } =
      body.applyCorrection;
    if (
      typeof lineId !== "string" ||
      !lineId ||
      typeof wrong !== "string" ||
      typeof suggestion !== "string"
    ) {
      return NextResponse.json(
        { ok: false, message: "잘못된 요청입니다." },
        { status: 400 },
      );
    }
    const applied = applyLineCorrection(row, {
      lineId,
      wrong,
      suggestion,
      startOffset: typeof startOffset === "number" ? startOffset : undefined,
      endOffset: typeof endOffset === "number" ? endOffset : undefined,
    });
    if (!applied.ok) {
      return NextResponse.json(
        { ok: false, message: applied.message },
        { status: 400 },
      );
    }
    const next = updateUserMeeting(id, { transcript: applied.record.transcript });
    return NextResponse.json({ ok: true, transcript: next?.transcript });
  }

  if (body.setMemo) {
    const { lineId, memo } = body.setMemo;
    if (typeof lineId !== "string" || !lineId || typeof memo !== "string") {
      return NextResponse.json(
        { ok: false, message: "잘못된 요청입니다." },
        { status: 400 },
      );
    }
    const updated = setLineMemo(row, lineId, memo);
    if (!updated.ok) {
      return NextResponse.json(
        { ok: false, message: updated.message },
        { status: 400 },
      );
    }
    const next = updateUserMeeting(id, { transcript: updated.record.transcript });
    return NextResponse.json({ ok: true, transcript: next?.transcript });
  }

  const patch: { title?: string; date?: string } = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) {
      return NextResponse.json(
        { ok: false, message: "제목이 필요합니다." },
        { status: 400 },
      );
    }
    patch.title = title;
  }

  if (typeof body.date === "string") {
    const date = normalizeMeetingDateIso(body.date);
    if (!date) {
      return NextResponse.json(
        { ok: false, message: "날짜 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }
    patch.date = date;
  }

  if (!patch.title && !patch.date) {
    return NextResponse.json(
      { ok: false, message: "수정할 항목이 없습니다." },
      { status: 400 },
    );
  }

  const next = updateUserMeeting(id, {
    meeting: { ...row.meeting, ...patch },
  });

  return NextResponse.json({ ok: true, meeting: next?.meeting });
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const row = getUserMeeting(id);
  if (!row || row.userId !== session.user.id) {
    return NextResponse.json(
      { ok: false, message: "회의 없음" },
      { status: 404 },
    );
  }
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

  deleteUserMeeting(id);
  return NextResponse.json({ ok: true });
}
