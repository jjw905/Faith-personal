export const PERSONAL_REALTIME_MAX_PARTICIPANTS = 4;
export const PERSONAL_REALTIME_MAX_INVITEES =
  PERSONAL_REALTIME_MAX_PARTICIPANTS - 1;

export function uniqueRealtimeInvitees(
  userIds: string[],
  ownerId: string,
): string[] {
  return Array.from(
    new Set(
      userIds
        .map((userId) => userId.trim())
        .filter((userId) => userId && userId !== ownerId),
    ),
  ).slice(0, PERSONAL_REALTIME_MAX_INVITEES);
}

export function hasValidPersonalRealtimeParticipantCount(
  inviteeCount: number,
): boolean {
  return (
    Number.isInteger(inviteeCount) &&
    inviteeCount >= 0 &&
    inviteeCount <= PERSONAL_REALTIME_MAX_INVITEES
  );
}
