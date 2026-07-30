/** Pure schedule/invite input helpers (client-safe). */

export type ScheduleInput = {
  title: string;
  scheduledStartAt: Date;
  durationMinutes: number;
  organizerId: string;
  participantIds: string[];
  backupHostId?: string | null;
};

export function validateScheduleInput(body: {
  title?: string;
  scheduledStartAt?: string;
  durationMinutes?: number;
  organizerId?: string;
  participantIds?: string[];
  backupHostId?: string | null;
}): { ok: true; value: ScheduleInput } | { ok: false; message: string } {
  const title = body.title?.trim().slice(0, 100);
  const scheduledStartAt = body.scheduledStartAt
    ? new Date(body.scheduledStartAt)
    : null;
  const durationMinutes = Number(body.durationMinutes);
  const organizerId = body.organizerId?.trim();
  const participantIds = Array.from(
    new Set((body.participantIds ?? []).filter(Boolean)),
  );
  if (!title) return { ok: false, message: "회의 제목을 입력해 주세요." };
  if (!scheduledStartAt || Number.isNaN(scheduledStartAt.getTime())) {
    return { ok: false, message: "시작 시각을 확인해 주세요." };
  }
  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes < 5 ||
    durationMinutes > 120
  ) {
    return { ok: false, message: "회의 시간은 5~120분입니다." };
  }
  if (!organizerId) return { ok: false, message: "주최자를 지정해 주세요." };
  const inviteeIds = participantIds.filter((id) => id !== organizerId);
  if (inviteeIds.length < 1) {
    return { ok: false, message: "함께할 팀원을 초대해 주세요." };
  }
  if (!participantIds.includes(organizerId)) {
    participantIds.push(organizerId);
  }
  let backupHostId = body.backupHostId ?? null;
  if (backupHostId && !participantIds.includes(backupHostId)) {
    // 초대 목록에서 빠진 대리 주최자는 자동 해제
    backupHostId = null;
  }
  return {
    ok: true,
    value: {
      title,
      scheduledStartAt,
      durationMinutes,
      organizerId,
      participantIds,
      backupHostId,
    },
  };
}

/** 좌석 한도 안에서 주최자를 항상 포함하고 초대자만 자른다. */
export function clampParticipantsToSeatLimit(
  participantIds: string[],
  organizerId: string,
  seatLimit: number,
): string[] {
  const limit = Math.max(1, Math.floor(seatLimit) || 1);
  const unique = Array.from(new Set(participantIds.filter(Boolean)));
  const invitees = unique.filter((id) => id !== organizerId);
  const cappedInvitees = invitees.slice(0, Math.max(0, limit - 1));
  return [organizerId, ...cappedInvitees];
}

export function meetingCardStatus(params: {
  state: string;
  canceledAt: Date | null;
  derivedPhase: string;
}) {
  if (params.state === "CANCELED" || params.canceledAt) return "취소됨";
  if (params.derivedPhase === "ended" || params.state === "ENDED") return "종료";
  if (params.derivedPhase === "in_progress" || params.state === "ACTIVE") {
    return "진행 중";
  }
  if (params.derivedPhase === "join_open") return "입장 가능";
  if (params.derivedPhase === "host_absence_warn") return "주최자 대기";
  if (params.derivedPhase === "host_absence_close") return "주최자 부재로 종료";
  return "예정";
}
