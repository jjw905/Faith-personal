import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import {
  decryptTeamChunkedRangeWithDataKey,
  decryptTeamBufferWithDataKey,
  encryptTeamChunkedBufferWithDataKey,
  encryptTeamBufferWithDataKey,
  isTeamChunkedEncryptedEnvelope,
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

  const chunkedPlaintext = Buffer.alloc(2_500_123);
  for (let index = 0; index < chunkedPlaintext.length; index += 1) {
    chunkedPlaintext[index] = index % 251;
  }
  const chunked = encryptTeamChunkedBufferWithDataKey({
    teamId,
    purpose: "content",
    dataKey,
    plaintext: chunkedPlaintext,
  });
  assert.ok(isTeamChunkedEncryptedEnvelope(chunked.envelope));
  assert.equal(chunked.envelope.plaintextSize, chunkedPlaintext.length);
  assert.equal(chunked.body.length, chunkedPlaintext.length);
  assert.equal(chunked.envelope.tags.length, 3);

  for (const [start, end] of [
    [12, 4_095],
    [chunked.envelope.chunkSize - 17, chunked.envelope.chunkSize + 43],
    [2_400_000, chunkedPlaintext.length - 1],
    [0, chunkedPlaintext.length - 1],
  ] as const) {
    const firstChunk = Math.floor(start / chunked.envelope.chunkSize);
    const lastChunk = Math.floor(end / chunked.envelope.chunkSize);
    const ciphertextStart = firstChunk * chunked.envelope.chunkSize;
    const ciphertextEnd = Math.min(
      chunkedPlaintext.length,
      (lastChunk + 1) * chunked.envelope.chunkSize,
    );
    const opened = decryptTeamChunkedRangeWithDataKey({
      teamId,
      purpose: "content",
      dataKey,
      ciphertext: chunked.body.subarray(ciphertextStart, ciphertextEnd),
      ciphertextStart,
      start,
      end,
      envelope: chunked.envelope,
    });
    assert.deepEqual(opened, chunkedPlaintext.subarray(start, end + 1));
  }

  const tamperedChunk = Buffer.from(
    chunked.body.subarray(0, chunked.envelope.chunkSize),
  );
  tamperedChunk[123] ^= 1;
  assert.throws(() =>
    decryptTeamChunkedRangeWithDataKey({
      teamId,
      purpose: "content",
      dataKey,
      ciphertext: tamperedChunk,
      ciphertextStart: 0,
      start: 0,
      end: 1_023,
      envelope: chunked.envelope,
    }),
  );

  if (process.argv.includes("--large")) {
    const largeBytes = 100 * 1024 * 1024;
    const largePlaintext = Buffer.alloc(largeBytes, 0x5a);
    const encryptStarted = performance.now();
    const largeEncrypted = encryptTeamChunkedBufferWithDataKey({
      teamId,
      purpose: "content",
      dataKey,
      plaintext: largePlaintext,
    });
    const encryptMs = performance.now() - encryptStarted;
    const start = 53 * 1024 * 1024 + 123;
    const end = start + 4_095;
    const firstChunk = Math.floor(start / largeEncrypted.envelope.chunkSize);
    const ciphertextStart = firstChunk * largeEncrypted.envelope.chunkSize;
    const ciphertextEnd = Math.min(
      largeEncrypted.body.length,
      ciphertextStart + largeEncrypted.envelope.chunkSize,
    );
    const before = process.memoryUsage();
    const rangeStarted = performance.now();
    const opened = decryptTeamChunkedRangeWithDataKey({
      teamId,
      purpose: "content",
      dataKey,
      ciphertext: largeEncrypted.body.subarray(ciphertextStart, ciphertextEnd),
      ciphertextStart,
      start,
      end,
      envelope: largeEncrypted.envelope,
    });
    const rangeMs = performance.now() - rangeStarted;
    const after = process.memoryUsage();
    assert.equal(opened.length, 4_096);
    assert.deepEqual(opened, largePlaintext.subarray(start, end + 1));
    // Range 복호화가 읽는 암호문은 파일 전체가 아니라 겹치는 1MiB 청크 하나다.
    assert.equal(ciphertextEnd - ciphertextStart, 1024 * 1024);
    console.log(
      JSON.stringify({
        largeRange: {
          plaintextBytes: largeBytes,
          chunkBytesRead: ciphertextEnd - ciphertextStart,
          responseBytes: opened.length,
          chunks: largeEncrypted.envelope.tags.length,
          encryptMs,
          rangeDecryptMs: rangeMs,
          rssDeltaBytes: after.rss - before.rss,
          externalDeltaBytes: after.external - before.external,
          note: "로컬 crypto 코어 수치이며 GCS/KMS 네트워크 지연은 스테이징에서 별도 측정",
        },
      }),
    );
  }

  console.log("Team encryption v1/v2 envelope and Range tests passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
