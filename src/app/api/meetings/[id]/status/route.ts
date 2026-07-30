import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { meetingDisplayTitle } from "@/lib/meeting-process";
import {
  getUserMeeting,
  healStaleProcessingMeeting,
} from "@/lib/user-meetings-store";

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
  const healed = healStaleProcessingMeeting(id);
  const row = healed ?? getUserMeeting(id);
  if (!row || row.userId !== session.user.id) {
    return NextResponse.json(
      { ok: false, message: "회의 없음" },
      { status: 404 },
    );
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
            ? 4
            : row.phase === "done"
              ? 100
              : 0,
    errorMessage: row.errorMessage ?? null,
    stageLabel: row.stageLabel ?? null,
    title: meetingDisplayTitle({ title: row.meeting.title }),
    href: `/meetings/${row.id}`,
  });
}
