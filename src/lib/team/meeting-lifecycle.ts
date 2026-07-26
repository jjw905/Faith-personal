/** Server-time derivation for scheduled online voice meetings. */

export const JOIN_OPEN_BEFORE_MS = 10 * 60_000;
export const MISSED_AFTER_START_MS = 60_000;
export const HOST_ABSENCE_WARN_MS = 9 * 60_000;
export const HOST_ABSENCE_CLOSE_MS = 10 * 60_000;

export type MeetingLifecycleInput = {
  state: "SCHEDULED" | "ACTIVE" | "ENDED" | "CANCELED" | "PROCESSING" | "READY" | "FAILED";
  scheduledStartAt: Date | null;
  durationMinutes: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  hostPresentAt: Date | null;
  absenceWarnedAt: Date | null;
  currentHostId: string | null;
  organizerId: string;
  backupHostId: string | null;
};

export type DerivedMeetingPhase =
  | "canceled"
  | "ended"
  | "scheduled"
  | "join_open"
  | "in_progress"
  | "host_absence_warn"
  | "host_absence_close";

export type DerivedMeetingState = {
  nowMs: number;
  scheduledStartMs: number | null;
  scheduledEndMs: number | null;
  joinOpenAtMs: number | null;
  phase: DerivedMeetingPhase;
  canJoin: boolean;
  canChangeSchedule: boolean;
  canReplaceParticipants: boolean;
  showJoinOnNearestCard: boolean;
  shouldEmitMissed: boolean;
  shouldWarnHostAbsence: boolean;
  shouldCloseForHostAbsence: boolean;
  overrunIntoNext: boolean;
};

export function deriveMeetingState(
  meeting: MeetingLifecycleInput,
  now = new Date(),
  nextMeetingStartMs?: number | null,
): DerivedMeetingState {
  const nowMs = now.getTime();
  const scheduledStartMs = meeting.scheduledStartAt?.getTime() ?? null;
  const durationMinutes = meeting.durationMinutes ?? null;
  const scheduledEndMs =
    scheduledStartMs != null && durationMinutes != null
      ? scheduledStartMs + durationMinutes * 60_000
      : null;
  const joinOpenAtMs =
    scheduledStartMs != null ? scheduledStartMs - JOIN_OPEN_BEFORE_MS : null;

  if (meeting.state === "CANCELED" || meeting.endedAt) {
    return {
      nowMs,
      scheduledStartMs,
      scheduledEndMs,
      joinOpenAtMs,
      phase: meeting.state === "CANCELED" ? "canceled" : "ended",
      canJoin: false,
      canChangeSchedule: false,
      canReplaceParticipants: false,
      showJoinOnNearestCard: false,
      shouldEmitMissed: false,
      shouldWarnHostAbsence: false,
      shouldCloseForHostAbsence: false,
      overrunIntoNext: false,
    };
  }

  const hostPresent = Boolean(meeting.hostPresentAt);
  const started =
    meeting.state === "ACTIVE" ||
    Boolean(meeting.startedAt) ||
    (scheduledStartMs != null && nowMs >= scheduledStartMs && hostPresent);

  let phase: DerivedMeetingPhase = "scheduled";
  if (
    scheduledStartMs != null &&
    !hostPresent &&
    nowMs >= scheduledStartMs + HOST_ABSENCE_CLOSE_MS
  ) {
    phase = "host_absence_close";
  } else if (
    scheduledStartMs != null &&
    !hostPresent &&
    nowMs >= scheduledStartMs + HOST_ABSENCE_WARN_MS
  ) {
    phase = "host_absence_warn";
  } else if (started || meeting.state === "ACTIVE") {
    phase = "in_progress";
  } else if (joinOpenAtMs != null && nowMs >= joinOpenAtMs) {
    phase = "join_open";
  }

  const canJoin =
    phase === "join_open" ||
    phase === "in_progress" ||
    phase === "host_absence_warn";

  const showJoinOnNearestCard =
    canJoin && (scheduledEndMs == null || nowMs < scheduledEndMs || meeting.state === "ACTIVE");

  const shouldEmitMissed =
    scheduledStartMs != null &&
    nowMs >= scheduledStartMs + MISSED_AFTER_START_MS &&
    phase !== "host_absence_close";

  const overrunIntoNext =
    Boolean(meeting.startedAt || meeting.state === "ACTIVE") &&
    nextMeetingStartMs != null &&
    nowMs > nextMeetingStartMs;

  return {
    nowMs,
    scheduledStartMs,
    scheduledEndMs,
    joinOpenAtMs,
    phase,
    canJoin,
    canChangeSchedule: !started && phase !== "host_absence_close",
    canReplaceParticipants: !started && phase !== "host_absence_close",
    showJoinOnNearestCard,
    shouldEmitMissed,
    shouldWarnHostAbsence: phase === "host_absence_warn" && !meeting.absenceWarnedAt,
    shouldCloseForHostAbsence: phase === "host_absence_close",
    overrunIntoNext,
  };
}

export function effectiveHostId(meeting: {
  currentHostId: string | null;
  organizerId: string;
}) {
  return meeting.currentHostId || meeting.organizerId;
}

/** Transfer only to designated backup when present; never to unrelated team representative/leader. */
export function resolveHostFallback(params: {
  organizerId: string;
  backupHostId: string | null;
  presentUserIds: Set<string>;
  organizerDisabledOrLeft: boolean;
}) {
  const organizerPresent =
    !params.organizerDisabledOrLeft &&
    params.presentUserIds.has(params.organizerId);
  if (organizerPresent) {
    return { hostId: params.organizerId, transferred: false as const, needsOwnerChoice: false };
  }
  if (
    params.backupHostId &&
    params.presentUserIds.has(params.backupHostId)
  ) {
    return {
      hostId: params.backupHostId,
      transferred: true as const,
      needsOwnerChoice: false,
    };
  }
  return {
    hostId: null,
    transferred: false as const,
    needsOwnerChoice: true,
  };
}
