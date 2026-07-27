/**
 * 업로드 음성 길이·용량 한도 거절 분기 단위 검증.
 * 실행: npx tsx --tsconfig tsconfig.json scripts/test-upload-audio-limit.ts
 */
import assert from "node:assert/strict";

import {
  assertUploadAudioBytes,
  assertUploadAudioDuration,
  DIRECT_UPLOAD_MAX_BYTES,
  DIRECT_UPLOAD_MAX_MB,
  isUploadAudioTooLarge,
  isUploadAudioTooLong,
  MAX_UPLOAD_AUDIO_MINUTES,
  MAX_UPLOAD_AUDIO_SEC,
  UPLOAD_AUDIO_TOO_LARGE_MESSAGE,
  UPLOAD_AUDIO_TOO_LONG_MESSAGE,
} from "../src/lib/stt/upload-limits";

function run() {
  assert.equal(MAX_UPLOAD_AUDIO_SEC, 3600);
  assert.equal(MAX_UPLOAD_AUDIO_MINUTES, 60);
  assert.equal(DIRECT_UPLOAD_MAX_BYTES, 24 * 1024 * 1024);
  assert.equal(DIRECT_UPLOAD_MAX_MB, 24);

  assert.equal(isUploadAudioTooLong(3600), false);
  assert.equal(isUploadAudioTooLong(3600.001), true);
  assert.equal(isUploadAudioTooLong(7200), true);
  assert.equal(isUploadAudioTooLong(NaN), false);
  assert.equal(isUploadAudioTooLong(-1), false);

  assert.doesNotThrow(() => assertUploadAudioDuration(0));
  assert.doesNotThrow(() => assertUploadAudioDuration(3599));
  assert.doesNotThrow(() => assertUploadAudioDuration(3600));

  assert.throws(
    () => assertUploadAudioDuration(3601),
    (err: unknown) =>
      err instanceof Error && err.message === UPLOAD_AUDIO_TOO_LONG_MESSAGE,
  );
  assert.throws(
    () => assertUploadAudioDuration(60 * 60 + 1),
    (err: unknown) =>
      err instanceof Error && err.message.includes("60분"),
  );

  assert.equal(isUploadAudioTooLarge(DIRECT_UPLOAD_MAX_BYTES), false);
  assert.equal(isUploadAudioTooLarge(DIRECT_UPLOAD_MAX_BYTES + 1), true);
  assert.equal(isUploadAudioTooLarge(NaN), false);

  assert.doesNotThrow(() => assertUploadAudioBytes(0));
  assert.doesNotThrow(() => assertUploadAudioBytes(DIRECT_UPLOAD_MAX_BYTES));

  assert.throws(
    () => assertUploadAudioBytes(DIRECT_UPLOAD_MAX_BYTES + 1),
    (err: unknown) =>
      err instanceof Error && err.message === UPLOAD_AUDIO_TOO_LARGE_MESSAGE,
  );
  assert.throws(
    () => assertUploadAudioBytes(25 * 1024 * 1024),
    (err: unknown) =>
      err instanceof Error && err.message.includes("24MB"),
  );

  console.log("upload audio limit ok");
}

run();
