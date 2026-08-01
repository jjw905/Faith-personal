import assert from "node:assert/strict";

import {
  hasTeamCapability,
  isTeamInviteExpired,
  TEAM_INVITE_TTL_MS,
  type TeamPermissionSubject,
} from "../src/lib/team-permission-matrix";
import {
  classifyScheduleConflicts,
  intervalsOverlap,
  scheduledEndMs,
} from "../src/lib/team/schedule-conflicts";
import {
  deriveMeetingState,
  JOIN_OPEN_BEFORE_MS,
  MISSED_AFTER_START_MS,
  resolveHostFallback,
} from "../src/lib/team/meeting-lifecycle";
import {
  resolveEntryMicrophoneOn,
  resolvePreHostRecordingAllowed,
  mergeTeamSecurityWins,
} from "../src/lib/team/settings-precedence";
import {
  meetingAckGroupKey,
  NOTIFICATION_KINDS,
} from "../src/lib/team/notification-kinds";
import {
  assertOnlineOnly,
  hashScheduleLockToken,
  participantScheduleLockPairs,
  SCHEDULE_LOCK_NAMESPACE,
} from "../src/lib/team/schedule-locks";
import {
  isLiveTeamSttRuntimeAvailable,
  LIVE_TEAM_STT_INTEGRATION,
  liveTeamSttUnavailableMessage,
} from "../src/lib/team/live-stt";
import {
  NOTIFICATION_RECENT_DISPLAY_DAYS,
  TEAM_AUDIT_RETENTION_DAYS,
  TEAM_TRASH_RETENTION_SUPPORTED,
  isPastDataRetention,
  isWithinRetentionDays,
} from "../src/lib/data-retention";
import {
  TEAM_FEATURE_ADMIN_ONLY,
  TEAM_FEATURE_ENABLED,
  isTeamFeatureEnabledForRole,
} from "../src/lib/feature-flags";

const owner: TeamPermissionSubject = {
  role: "OWNER",
  canInvite: false,
  canCreateMeeting: false,
  canManageRecordAccess: false,
};
const admin: TeamPermissionSubject = { ...owner, role: "ADMIN" };
const member: TeamPermissionSubject = { ...owner, role: "MEMBER" };
const delegate: TeamPermissionSubject = {
  role: "MEMBER",
  canInvite: true,
  canCreateMeeting: true,
  canManageRecordAccess: true,
};

for (const capability of [
  "manageTeam",
  "invite",
  "createMeeting",
  "manageRecordAccess",
  "viewAudit",
] as const) {
  assert.equal(hasTeamCapability(owner, capability), true);
}
assert.equal(hasTeamCapability(admin, "manageTeam"), true);
assert.equal(hasTeamCapability(admin, "viewAudit"), false);
assert.equal(hasTeamCapability(member, "invite"), false);
assert.equal(hasTeamCapability(member, "createMeeting"), false);
assert.equal(hasTeamCapability(member, "manageRecordAccess"), false);
assert.equal(hasTeamCapability(delegate, "invite"), true);
assert.equal(hasTeamCapability(delegate, "createMeeting"), true);
assert.equal(hasTeamCapability(delegate, "manageRecordAccess"), true);
assert.equal(hasTeamCapability(delegate, "manageTeam"), false);

// Platform team gate: changing the launch switch must not require test edits.
assert.equal(TEAM_FEATURE_ENABLED, true);
assert.equal(isTeamFeatureEnabledForRole("ADMIN"), true);
assert.equal(
  isTeamFeatureEnabledForRole("USER"),
  !TEAM_FEATURE_ADMIN_ONLY,
);
assert.equal(isTeamFeatureEnabledForRole("MEMBER"), false);
assert.equal(isTeamFeatureEnabledForRole(null), false);

const now = new Date("2026-07-24T06:00:00.000Z");
assert.equal(
  isTeamInviteExpired(new Date(now.getTime() + TEAM_INVITE_TTL_MS), now),
  false,
);
assert.equal(isTeamInviteExpired(now, now), true);

// Conflict intervals: back-to-back allowed, true overlap blocked.
const a = { startMs: 0, endMs: 60_000 };
const b = { startMs: 60_000, endMs: 120_000 };
const c = { startMs: 30_000, endMs: 90_000 };
assert.equal(intervalsOverlap(a, b), false);
assert.equal(intervalsOverlap(a, c), true);
assert.equal(scheduledEndMs(0, 30), 30 * 60_000);

const classified = classifyScheduleConflicts({
  proposed: { startMs: 0, endMs: 60_000 },
  byUser: [
    {
      userId: "u1",
      meetings: [
        {
          id: "m-visible",
          teamId: "t1",
          teamName: "Alpha",
          title: "Standup",
          startMs: 30_000,
          endMs: 90_000,
          accessible: true,
        },
      ],
    },
    {
      userId: "u2",
      meetings: [
        {
          id: "m-private",
          teamId: "t2",
          teamName: "Secret",
          title: "Hidden",
          startMs: 10_000,
          endMs: 50_000,
          accessible: false,
        },
      ],
    },
  ],
});
assert.equal(classified.blocked, true);
assert.equal(classified.visible.length, 1);
assert.equal(classified.visible[0]?.teamName, "Alpha");
assert.equal(classified.privateNotices.length, 1);
assert.equal(classified.privateNotices[0]?.userId, "u2");
assert.ok(!JSON.stringify(classified.visible).includes("Secret"));

// Server-time lifecycle derivation.
const scheduledStart = new Date("2026-07-24T10:00:00.000Z");
const baseMeeting = {
  state: "SCHEDULED" as const,
  scheduledStartAt: scheduledStart,
  durationMinutes: 30,
  startedAt: null,
  endedAt: null,
  hostPresentAt: null,
  absenceWarnedAt: null,
  currentHostId: null,
  organizerId: "org",
  backupHostId: "backup",
};
const beforeJoin = deriveMeetingState(
  baseMeeting,
  new Date(scheduledStart.getTime() - JOIN_OPEN_BEFORE_MS - 1),
);
assert.equal(beforeJoin.phase, "scheduled");
assert.equal(beforeJoin.canJoin, false);
const joinOpen = deriveMeetingState(
  baseMeeting,
  new Date(scheduledStart.getTime() - JOIN_OPEN_BEFORE_MS),
);
assert.equal(joinOpen.phase, "join_open");
assert.equal(joinOpen.showJoinOnNearestCard, true);
const missedPoint = deriveMeetingState(
  baseMeeting,
  new Date(scheduledStart.getTime() + MISSED_AFTER_START_MS),
);
assert.equal(missedPoint.shouldEmitMissed, true);
const closePoint = deriveMeetingState(
  baseMeeting,
  new Date(scheduledStart.getTime() + 10 * 60_000),
);
assert.equal(closePoint.shouldCloseForHostAbsence, true);

// Host fallback never picks unrelated owner/leader.
const noTransfer = resolveHostFallback({
  organizerId: "org",
  backupHostId: "backup",
  presentUserIds: new Set(["owner", "leader", "member"]),
  organizerDisabledOrLeft: true,
});
assert.equal(noTransfer.hostId, null);
assert.equal(noTransfer.needsOwnerChoice, true);
const backupTransfer = resolveHostFallback({
  organizerId: "org",
  backupHostId: "backup",
  presentUserIds: new Set(["backup", "owner"]),
  organizerDisabledOrLeft: true,
});
assert.equal(backupTransfer.hostId, "backup");
assert.equal(backupTransfer.transferred, true);

// Settings precedence: team force-off wins; personal cannot weaken.
const mic = resolveEntryMicrophoneOn({
  inTeamWorkspace: true,
  team: { forceMicrophoneOff: true },
  personal: { defaultMicrophoneOn: true, preferredInputDeviceId: "mic-1" },
});
assert.equal(mic.microphoneOn, false);
assert.equal(mic.source, "team_force_off");
const personalOnly = resolveEntryMicrophoneOn({
  inTeamWorkspace: false,
  team: { forceMicrophoneOff: true },
  personal: { defaultMicrophoneOn: true, preferredInputDeviceId: null },
});
assert.equal(personalOnly.microphoneOn, true);
const locked = resolvePreHostRecordingAllowed({
  teamDefault: false,
  teamLocked: true,
  meetingOverride: true,
  actorIsLeader: true,
  actorIsOwner: false,
});
assert.equal(locked.allowed, false);
assert.equal(locked.source, "team_locked");
const merged = mergeTeamSecurityWins(
  { forceMicrophoneOff: true },
  { forceMicrophoneOff: false },
);
assert.equal(merged.forceMicrophoneOff, true);

// Notification ack sync keys.
assert.equal(meetingAckGroupKey("m1"), "meeting-ack:m1");
assert.equal(NOTIFICATION_KINDS.MEETING_ACK, "meeting_ack");
assert.equal(NOTIFICATION_KINDS.MEETING_MISSED, "meeting_missed");

// Schedule advisory lock pairs: deterministic, sorted, deadlock-safe order.
const lockA = participantScheduleLockPairs(["u-b", "u-a", "u-a", ""]);
const lockB = participantScheduleLockPairs(["u-a", "u-b"]);
assert.deepEqual(lockA, lockB);
assert.equal(lockA.length, 2);
assert.equal(lockA[0]?.[0], SCHEDULE_LOCK_NAMESPACE);
assert.equal(lockA[0]?.[1], hashScheduleLockToken("u-a"));
assert.equal(lockA[1]?.[1], hashScheduleLockToken("u-b"));
assert.ok(lockA[0]![1] !== lockA[1]![1]);
// Same participant set always yields identical ordered keys (guard path input).
assert.deepEqual(
  participantScheduleLockPairs(["z", "m", "a"]),
  participantScheduleLockPairs(["a", "z", "m"]),
);
// Prisma binds numbers as bigint; production lock SQL must cast to integer.
assert.equal(typeof lockA[0]![0], "number");
assert.equal(typeof lockA[0]![1], "number");
assert.ok(Number.isInteger(lockA[0]![0]));
assert.ok(Number.isInteger(lockA[0]![1]));

// Offline team meetings rejected at policy boundary.
assert.equal(assertOnlineOnly("OFFLINE").ok, false);
assert.equal(assertOnlineOnly("ONLINE").ok, true);
assert.equal(assertOnlineOnly(undefined).ok, true);

// Live team STT stays behind the launch switch and requires an API key.
assert.equal(
  isLiveTeamSttRuntimeAvailable({ OPENAI_API_KEY: "test-key" }, false),
  false,
);
assert.equal(
  isLiveTeamSttRuntimeAvailable(
    { OPENAI_API_KEY: "your_openai_api_key_here" },
    true,
  ),
  false,
);
assert.equal(
  isLiveTeamSttRuntimeAvailable({ OPENAI_API_KEY: "test-key" }, true),
  true,
);
assert.ok(LIVE_TEAM_STT_INTEGRATION.toLowerCase().includes("livekit"));
assert.ok(liveTeamSttUnavailableMessage(false).includes("중지"));
assert.ok(liveTeamSttUnavailableMessage(true).includes("설정"));

// Retention: audit 2y is enforceable; trash 7d lifecycle is not modeled.
assert.equal(TEAM_AUDIT_RETENTION_DAYS, 730);
assert.equal(TEAM_TRASH_RETENTION_SUPPORTED, false);
const retentionNow = new Date("2026-07-24T00:00:00.000Z");
assert.equal(
  isPastDataRetention("2024-07-23T00:00:00.000Z", TEAM_AUDIT_RETENTION_DAYS, retentionNow),
  true,
);
assert.equal(
  isPastDataRetention("2024-07-25T00:00:00.000Z", TEAM_AUDIT_RETENTION_DAYS, retentionNow),
  false,
);
assert.equal(
  isWithinRetentionDays(
    "2026-07-20T00:00:00.000Z",
    NOTIFICATION_RECENT_DISPLAY_DAYS,
    retentionNow,
  ),
  true,
);
assert.equal(
  isWithinRetentionDays(
    "2026-07-10T00:00:00.000Z",
    NOTIFICATION_RECENT_DISPLAY_DAYS,
    retentionNow,
  ),
  false,
);

console.log("Team policies: OK");
console.log(
  "LIVE_STT_SWITCH_READY:",
  LIVE_TEAM_STT_INTEGRATION,
  "| disabled by default; launch requires the public switch, OpenAI, and LiveKit",
);
console.log(
  "TRASH_RETENTION_GAP: soft-delete/deletedAt not modeled; 7-day trash purge not active",
);
