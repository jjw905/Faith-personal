/** Pure interval helpers for team meeting scheduling conflicts. */

export type TimeInterval = {
  startMs: number;
  endMs: number;
};

export type ConflictMeeting = {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  startMs: number;
  endMs: number;
  /** Whether the conflict evaluator can see this meeting's metadata. */
  accessible: boolean;
};

export type VisibleConflict = {
  meetingId: string;
  teamName: string;
  title: string;
  startMs: number;
  endMs: number;
  overlapStartMs: number;
  overlapEndMs: number;
};

export type PrivateConflictNotice = {
  userId: string;
  meetingId: string;
};

/** True overlap only. Back-to-back (prior end === next start) is allowed. */
export function intervalsOverlap(a: TimeInterval, b: TimeInterval) {
  return a.startMs < b.endMs && a.endMs > b.startMs;
}

export function overlapInterval(
  a: TimeInterval,
  b: TimeInterval,
): TimeInterval | null {
  if (!intervalsOverlap(a, b)) return null;
  return {
    startMs: Math.max(a.startMs, b.startMs),
    endMs: Math.min(a.endMs, b.endMs),
  };
}

export function scheduledEndMs(startMs: number, durationMinutes: number) {
  return startMs + durationMinutes * 60_000;
}

/**
 * Split conflicts into organizer-visible details vs private member notices.
 * Inaccessible other-team meetings never leak metadata to the organizer.
 */
export function classifyScheduleConflicts(params: {
  proposed: TimeInterval;
  /** Candidate conflicts keyed by affected userId. */
  byUser: Array<{
    userId: string;
    meetings: ConflictMeeting[];
  }>;
}) {
  const visible: VisibleConflict[] = [];
  const privateNotices: PrivateConflictNotice[] = [];
  const seenVisible = new Set<string>();
  const seenPrivate = new Set<string>();

  for (const entry of params.byUser) {
    for (const meeting of entry.meetings) {
      const overlap = overlapInterval(params.proposed, {
        startMs: meeting.startMs,
        endMs: meeting.endMs,
      });
      if (!overlap) continue;

      if (meeting.accessible) {
        if (!seenVisible.has(meeting.id)) {
          seenVisible.add(meeting.id);
          visible.push({
            meetingId: meeting.id,
            teamName: meeting.teamName,
            title: meeting.title,
            startMs: meeting.startMs,
            endMs: meeting.endMs,
            overlapStartMs: overlap.startMs,
            overlapEndMs: overlap.endMs,
          });
        }
        continue;
      }

      const key = `${entry.userId}:${meeting.id}`;
      if (!seenPrivate.has(key)) {
        seenPrivate.add(key);
        privateNotices.push({
          userId: entry.userId,
          meetingId: meeting.id,
        });
      }
    }
  }

  return { visible, privateNotices, blocked: visible.length > 0 };
}
