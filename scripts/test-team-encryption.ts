import assert from "node:assert/strict";

import {
  decryptTeamBufferWithDataKey,
  encryptTeamBufferWithDataKey,
  isTeamEncryptedEnvelope,
} from "../src/lib/team-encryption-core";

process.env.NODE_ENV = "test";
process.env.AWS_KMS_ENABLED = "0";
process.env.GCP_KMS_ENABLED = "0";

async function main() {
  const teamId = "team-test";
  const dataKey = Buffer.alloc(32, 7);
  const plaintext = Buffer.from("Faith team content", "utf8");
  const encrypted = encryptTeamBufferWithDataKey({
    teamId,
    purpose: "content",
    dataKey,
    plaintext,
  });

  assert.equal(encrypted.encrypted, true);
  assert.ok(encrypted.envelope);
  assert.ok(isTeamEncryptedEnvelope(encrypted.envelope));
  assert.notDeepEqual(encrypted.body, plaintext);
  assert.deepEqual(
    decryptTeamBufferWithDataKey({
      teamId,
      purpose: "content",
      dataKey,
      body: encrypted.body,
      envelope: encrypted.envelope,
    }),
    plaintext,
  );

  assert.throws(() =>
    decryptTeamBufferWithDataKey({
      teamId: "another-team",
      purpose: "content",
      dataKey,
      body: encrypted.body,
      envelope: encrypted.envelope,
    }),
  );

  const tamperedBody = Buffer.from(encrypted.body);
  tamperedBody[0] ^= 1;
  assert.throws(() =>
    decryptTeamBufferWithDataKey({
      teamId,
      purpose: "content",
      dataKey,
      body: tamperedBody,
      envelope: encrypted.envelope,
    }),
  );

  const legacyValue = { title: "legacy", count: 1 };
  assert.equal(isTeamEncryptedEnvelope(legacyValue), false);
  assert.deepEqual(legacyValue, { title: "legacy", count: 1 });

  console.log("Team encryption envelope tests passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
