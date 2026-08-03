import assert from "node:assert/strict";

import {
  planIncludesSpeakerSplit,
  resolveAnalysisModeForEntitlement,
} from "../src/lib/plans";

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

console.log(JSON.stringify({ ok: true, cases }));
