import assert from "node:assert/strict";

import {
  planIncludesSpeakerSplit,
  resolveAnalysisModeForEntitlement,
} from "../src/lib/plans";
import {
  ANALYSIS_MODE_POLICY,
  chargedUsageSec,
  PRECISION_USAGE_MULTIPLIER,
} from "../src/lib/stt/analysis-mode";

const cases = [
  {
    name: "free-personal",
    actual: resolveAnalysisModeForEntitlement("FREE", "USER", "personal"),
    expected: "standard",
  },
  {
    name: "free-team-workspace",
    actual: resolveAnalysisModeForEntitlement("FREE", "USER", "team"),
    expected: "precision",
  },
  {
    name: "pro-personal",
    actual: resolveAnalysisModeForEntitlement("PRO", "USER", "personal"),
    expected: "precision",
  },
  {
    name: "admin-free-personal",
    actual: resolveAnalysisModeForEntitlement("FREE", "ADMIN", "personal"),
    expected: "precision",
  },
  {
    name: "team-catalog-personal",
    actual: resolveAnalysisModeForEntitlement("TEAM", "USER", "personal"),
    expected: "precision",
  },
] as const;

for (const item of cases) {
  assert.equal(item.actual, item.expected, item.name);
}

assert.equal(planIncludesSpeakerSplit("FREE", "USER", "personal"), false);
assert.equal(planIncludesSpeakerSplit("PRO", "USER", "personal"), true);
assert.equal(planIncludesSpeakerSplit("FREE", "USER", "team"), true);
assert.equal(planIncludesSpeakerSplit("FREE", "ADMIN", "personal"), true);
assert.equal(PRECISION_USAGE_MULTIPLIER, 1);
assert.equal(ANALYSIS_MODE_POLICY.precision.usageMultiplier, 1);
assert.equal(chargedUsageSec(600, "precision"), 600);

console.log(JSON.stringify({ ok: true, cases }));
