import assert from "node:assert/strict";

import { TEAM_NAV_ITEMS } from "../src/lib/constants";
import {
  TEAM_FEATURE_ADMIN_ONLY,
  isTeamFeatureEnabledForRole,
} from "../src/lib/feature-flags";
import { evaluateKmsRuntime } from "../src/lib/kms-runtime-policy";
import { resolvePageUxSurface } from "../src/lib/page-ux-registry";
import { isLiveTeamSttRuntimeAvailable } from "../src/lib/team/live-stt";

const navHrefs = TEAM_NAV_ITEMS.map((item) => item.href);
assert.equal(new Set(navHrefs).size, navHrefs.length);
assert.ok(
  TEAM_NAV_ITEMS.some(
    (item) =>
      item.href === "/team/live" && item.capability === "createMeeting",
  ),
);
assert.ok(
  TEAM_NAV_ITEMS.some(
    (item) =>
      item.href === "/team/schedule" && item.capability === "createMeeting",
  ),
);

assert.equal(isTeamFeatureEnabledForRole("ADMIN"), true);
assert.equal(
  isTeamFeatureEnabledForRole("USER"),
  !TEAM_FEATURE_ADMIN_ONLY,
);
assert.equal(isTeamFeatureEnabledForRole(null), false);

const liveSurface = resolvePageUxSurface("/team/live");
assert.equal(liveSurface.id, "team.live");
assert.ok(liveSurface.scenarios.some((scenario) => scenario.id === "empty"));
assert.ok(liveSurface.scenarios.some((scenario) => scenario.id === "loading"));

const scheduleSurface = resolvePageUxSurface("/team/schedule");
assert.equal(scheduleSurface.id, "team.schedule");

assert.equal(
  isLiveTeamSttRuntimeAvailable({ OPENAI_API_KEY: "test-key" }, false),
  false,
);
assert.equal(
  isLiveTeamSttRuntimeAvailable({ OPENAI_API_KEY: "test-key" }, true),
  true,
);

const securitySurface = resolvePageUxSurface(
  "/team",
  "?manage=security",
);
assert.equal(securitySurface.id, "team.security");
assert.ok(
  securitySurface.scenarios.some(
    (scenario) => scenario.id === "security-key-ready",
  ),
);
assert.ok(
  securitySurface.scenarios.some(
    (scenario) => scenario.id === "security-key-attention",
  ),
);

const kmsReady = evaluateKmsRuntime({
  NODE_ENV: "production",
  AWS_KMS_ENABLED: "1",
  AWS_KMS_RUNTIME_ENV: "production",
  AWS_REGION: "ap-southeast-1",
  AWS_ACCESS_KEY_ID: "test",
  AWS_SECRET_ACCESS_KEY: "test",
  AWS_KMS_CONTENT_KEY_ARN: "arn:aws:kms:test:content",
  AWS_KMS_AUDIT_KEY_ARN: "arn:aws:kms:test:audit",
});
assert.deepEqual(kmsReady, { allowed: true });

const kmsMissing = evaluateKmsRuntime({
  NODE_ENV: "production",
  AWS_KMS_ENABLED: "1",
  AWS_KMS_RUNTIME_ENV: "production",
});
assert.equal(kmsMissing.allowed, false);
if (!kmsMissing.allowed) {
  assert.equal(kmsMissing.reason, "missing_configuration");
}

console.log("team launch readiness scenarios passed");
