import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { writeTeamAudit } from "@/lib/team-permissions";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type RouteContext = { params: Promise<{ meetingId: string }> };

/**
 * 공유 버튼의 서버 관문. 팀 기록은 브라우저에서 현재 URL을 복사하는 것만으로
 * 정책을 우회하지 못하게 한다. 공개 게스트 열람 경로가 아직 없으므로, 정책이
 * 켜져 있어도 외부 공유는 안전하게 거절한다.
 */
export async function POST(
  request: Request,
  context: RouteContext,
) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { meetingId } = await context.params;

  const meeting = await prisma.teamMeeting.findFirst({
    where: {
      OR: [{ id: meetingId }, { legacyMeetingId: meetingId }],
    },
    include: {
      team: { include: { policy: true } },
      access: { where: { userId: session.user.id }, take: 1 },
    },
  });
  if (!meeting) {
    return NextResponse.json(
      { ok: false, message: "팀 회의를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  const membership = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId: meeting.teamId,
        userId: session.user.id,
      },
    },
  });
  const access = meeting.access[0];
  const canRead =
    membership &&
    (meeting.team.ownerId === session.user.id ||
      meeting.createdById === session.user.id ||
      Boolean(access?.isParticipant || access?.canReadMasked));
  const acknowledged =
    meeting.team.ownerId === session.user.id ||
    meeting.createdById === session.user.id ||
    Boolean(access?.acknowledgedAt);
  if (!canRead) {
    return NextResponse.json(
      { ok: false, message: "회의 공유 권한이 없습니다." },
      { status: 403 },
    );
  }
  if (!acknowledged) {
    return NextResponse.json(
      {
        ok: false,
        code: "MEETING_ACK_REQUIRED",
        message: "참석 확인 후 회의 공유를 요청할 수 있습니다.",
      },
      { status: 409 },
    );
  }

  await writeTeamAudit({
    teamId: meeting.teamId,
    actorId: session.user.id,
    meetingId: meeting.id,
    action: "meeting.share_blocked",
    metadata: {
      allowExternalSharing: meeting.team.policy?.allowExternalSharing ?? false,
      reason: "PUBLIC_GUEST_READING_UNAVAILABLE",
    },
    request,
  });
  return NextResponse.json(
    {
      ok: false,
      code: "TEAM_EXTERNAL_SHARING_UNAVAILABLE",
      message:
        "팀 기록 외부 공유는 공개 열람 링크가 준비된 뒤 제공됩니다. 현재는 팀 멤버에게만 공유할 수 있습니다.",
    },
    { status: 503 },
  );
}
