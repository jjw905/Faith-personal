/** Team vs personal settings precedence helpers. */

export type TeamMicPolicy = {
  forceMicrophoneOff: boolean;
};

export type PersonalMicPreference = {
  defaultMicrophoneOn: boolean;
  preferredInputDeviceId: string | null;
};

export type PreHostRecordingPolicy = {
  teamDefault: boolean;
  teamLocked: boolean;
  meetingOverride: boolean | null;
  actorIsLeader: boolean;
  actorIsOwner: boolean;
};

export function resolveEntryMicrophoneOn(params: {
  inTeamWorkspace: boolean;
  team: TeamMicPolicy | null;
  personal: PersonalMicPreference;
}) {
  if (params.inTeamWorkspace && params.team?.forceMicrophoneOff) {
    return {
      microphoneOn: false,
      source: "team_force_off" as const,
      preferredInputDeviceId: params.personal.preferredInputDeviceId,
    };
  }
  return {
    microphoneOn: params.personal.defaultMicrophoneOn,
    source: "personal" as const,
    preferredInputDeviceId: params.personal.preferredInputDeviceId,
  };
}

export function resolvePreHostRecordingAllowed(policy: PreHostRecordingPolicy) {
  if (policy.meetingOverride != null) {
    if (policy.teamLocked && !policy.actorIsOwner) {
      return {
        allowed: policy.teamDefault,
        source: "team_locked" as const,
        canOverride: false,
      };
    }
    return {
      allowed: policy.meetingOverride,
      source: "meeting_override" as const,
      canOverride: policy.actorIsOwner || (!policy.teamLocked && policy.actorIsLeader),
    };
  }
  return {
    allowed: policy.teamDefault,
    source: "team_default" as const,
    canOverride: policy.actorIsOwner || (!policy.teamLocked && policy.actorIsLeader),
  };
}

/** Personal prefs never weaken team security inside team workspace. */
export function mergeTeamSecurityWins<T extends Record<string, unknown>>(
  teamPolicy: T,
  personalPrefs: Partial<T>,
) {
  return { ...personalPrefs, ...teamPolicy };
}
