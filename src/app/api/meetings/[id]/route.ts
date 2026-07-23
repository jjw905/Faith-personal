import { NextResponse } from "next/server";

import { normalizeMeetingDateIso } from "@/lib/meeting-date";
import { renameParticipantInRecord } from "@/lib/rename-meeting-participant";
import { requireUser } from "@/lib/require-user";
import {
  deleteUserMeeting,
  getUserMeeting,
  updateUserMeeting,
} from "@/lib/user-meetings-store";

type Params = { params: Promise<{ id: string }> };

type PatchBody = {
  title?: string;
  date?: string;
  renameParticipant?: { id?: string; name?: string };
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

  deleteUserMeeting(id);
  return NextResponse.json({ ok: true });
}
