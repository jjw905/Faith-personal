/** Deterministic Postgres advisory lock key helpers (no DB I/O). */

/** Namespace for Postgres advisory locks (faith-schedule). */
export const SCHEDULE_LOCK_NAMESPACE = 0x46415448;

/** Deterministic 32-bit hash for advisory lock key2. */
export function hashScheduleLockToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

/**
 * Sorted lock pairs so concurrent create/update acquire in the same order
 * and avoid deadlocks. key1 is a fixed namespace, key2 is per participant.
 */
export function participantScheduleLockPairs(userIds: string[]) {
  const unique = Array.from(new Set(userIds.filter(Boolean))).sort();
  return unique.map(
    (userId) =>
      [SCHEDULE_LOCK_NAMESPACE, hashScheduleLockToken(userId)] as const,
  );
}

export function assertOnlineOnly(mode: string | undefined) {
  if (mode === "OFFLINE") {
    return {
      ok: false as const,
      message: "팀 회의는 온라인 음성 회의만 지원합니다.",
    };
  }
  if (mode && mode !== "ONLINE") {
    return { ok: false as const, message: "회의 방식을 확인해 주세요." };
  }
  return { ok: true as const };
}
