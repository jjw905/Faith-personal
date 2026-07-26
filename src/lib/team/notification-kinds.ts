/** Notification kind constants for team meeting lifecycle. */

export const NOTIFICATION_KINDS = {
  MEETING_ACK: "meeting_ack",
  MEETING_CHANGED: "meeting_changed",
  MEETING_CANCELED: "meeting_canceled",
  MEETING_MISSED: "meeting_missed",
  MEETING_PRIVATE_CONFLICT: "meeting_private_conflict",
  HOST_ABSENCE_OWNER: "host_absence_owner",
  ANNOUNCEMENT: "team_announcement",
} as const;

export type NotificationKind =
  (typeof NOTIFICATION_KINDS)[keyof typeof NOTIFICATION_KINDS];

export function meetingAckGroupKey(meetingId: string) {
  return `meeting-ack:${meetingId}`;
}

export function meetingChangeGroupKey(meetingId: string) {
  return `meeting-change:${meetingId}`;
}

export function meetingMissedGroupKey(meetingId: string) {
  return `meeting-missed:${meetingId}`;
}
