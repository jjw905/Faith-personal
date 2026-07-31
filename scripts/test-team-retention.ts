import assert from "node:assert/strict";

import {
  isTeamMeetingRetentionCandidate,
  TEAM_MEETING_RETENTION_STATES,
} from "@/lib/team/retention-policy";

const now = new Date("2026-07-31T00:00:00.000Z");

assert.deepEqual(TEAM_MEETING_RETENTION_STATES, [
  "ENDED",
  "CANCELED",
  "READY",
  "FAILED",
]);

assert.equal(
  isTeamMeetingRetentionCandidate(
    {
      state: "ENDED",
      createdAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-01-02T00:00:00.000Z",
    },
    90,
    now,
  ),
  true,
);

assert.equal(
  isTeamMeetingRetentionCandidate(
    {
      state: "ACTIVE",
      createdAt: "2025-01-01T00:00:00.000Z",
      endedAt: null,
    },
    90,
    now,
  ),
  false,
);

assert.equal(
  isTeamMeetingRetentionCandidate(
    {
      state: "ENDED",
      recordingActive: true,
      createdAt: "2025-01-01T00:00:00.000Z",
      endedAt: "2025-01-02T00:00:00.000Z",
    },
    90,
    now,
  ),
  false,
);

assert.equal(
  isTeamMeetingRetentionCandidate(
    {
      state: "ENDED",
      createdAt: "2026-01-01T00:00:00.000Z",
      endedAt: "2026-07-01T00:00:00.000Z",
    },
    90,
    now,
  ),
  false,
);

console.log("team retention policy tests passed");
