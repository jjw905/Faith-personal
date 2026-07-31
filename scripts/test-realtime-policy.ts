import assert from "node:assert/strict";

import {
  PERSONAL_REALTIME_MAX_INVITEES,
  PERSONAL_REALTIME_MAX_PARTICIPANTS,
  hasValidPersonalRealtimeParticipantCount,
  uniqueRealtimeInvitees,
} from "@/lib/realtime-policy";

assert.equal(PERSONAL_REALTIME_MAX_PARTICIPANTS, 4);
assert.equal(PERSONAL_REALTIME_MAX_INVITEES, 3);

assert.deepEqual(
  uniqueRealtimeInvitees(
    [" owner ", "u1", "u1", "u2", "u3", "u4"],
    "owner",
  ),
  ["u1", "u2", "u3"],
);
assert.equal(hasValidPersonalRealtimeParticipantCount(0), true);
assert.equal(hasValidPersonalRealtimeParticipantCount(3), true);
assert.equal(hasValidPersonalRealtimeParticipantCount(4), false);
assert.equal(hasValidPersonalRealtimeParticipantCount(1.5), false);

console.log("personal realtime policy tests passed");
