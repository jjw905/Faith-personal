import assert from "node:assert/strict";

import { evaluateKmsRuntime } from "../src/lib/kms-runtime-policy";

const configured = {
  NODE_ENV: "production",
  AWS_KMS_ENABLED: "1",
  AWS_KMS_RUNTIME_ENV: "production",
  AWS_REGION: "ap-southeast-1",
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  AWS_KMS_CONTENT_KEY_ARN: "arn:aws:kms:test:content",
  AWS_KMS_AUDIT_KEY_ARN: "arn:aws:kms:test:audit",
};

assert.deepEqual(
  evaluateKmsRuntime({ ...configured, NODE_ENV: "development" }),
  { allowed: false, reason: "non_production_node" },
);
assert.deepEqual(
  evaluateKmsRuntime({ ...configured, AWS_KMS_ENABLED: "0" }),
  { allowed: false, reason: "disabled" },
);
assert.deepEqual(
  evaluateKmsRuntime({ ...configured, AWS_KMS_RUNTIME_ENV: "preview" }),
  { allowed: false, reason: "non_production_runtime" },
);
assert.deepEqual(
  evaluateKmsRuntime({ ...configured, AWS_KMS_AUDIT_KEY_ARN: "" }),
  {
    allowed: false,
    reason: "missing_configuration",
    missing: ["AWS_KMS_AUDIT_KEY_ARN"],
  },
);
assert.deepEqual(evaluateKmsRuntime(configured), { allowed: true });

console.log("KMS runtime policy tests passed.");
