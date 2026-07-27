/** 업로드 음성 최대 길이(초). 초과 시 자르지 않고 거절. */
export const MAX_UPLOAD_AUDIO_SEC = 3600;

export const MAX_UPLOAD_AUDIO_MINUTES = MAX_UPLOAD_AUDIO_SEC / 60;

export const UPLOAD_AUDIO_TOO_LONG_MESSAGE =
  `업로드 음성은 최대 ${MAX_UPLOAD_AUDIO_MINUTES}분(1시간)까지 지원합니다. 더 짧은 파일로 올려 주세요.`;

/**
 * ffmpeg 없는 배포 서버는 원본을 한 번에 OpenAI로 보낸다.
 * API 한도(약 25MB)보다 약간 낮게 잡아 거절한다.
 */
export const DIRECT_UPLOAD_MAX_BYTES = 24 * 1024 * 1024;

export const DIRECT_UPLOAD_MAX_MB = Math.floor(
  DIRECT_UPLOAD_MAX_BYTES / (1024 * 1024),
);

export const UPLOAD_AUDIO_TOO_LARGE_MESSAGE =
  `이 서버에서는 ${DIRECT_UPLOAD_MAX_MB}MB 이하 파일만 전사할 수 있습니다. 더 작은 파일로 올려 주세요.`;

export function isUploadAudioTooLong(durationSec: number): boolean {
  return Number.isFinite(durationSec) && durationSec > MAX_UPLOAD_AUDIO_SEC;
}

/** durationSec를 알 수 있을 때만 호출. 초과면 Error. */
export function assertUploadAudioDuration(durationSec: number): void {
  if (isUploadAudioTooLong(durationSec)) {
    throw new Error(UPLOAD_AUDIO_TOO_LONG_MESSAGE);
  }
}

export function isUploadAudioTooLarge(bytes: number): boolean {
  return Number.isFinite(bytes) && bytes > DIRECT_UPLOAD_MAX_BYTES;
}

/** 파일 크기 한도. 초과면 Error. */
export function assertUploadAudioBytes(bytes: number): void {
  if (isUploadAudioTooLarge(bytes)) {
    throw new Error(UPLOAD_AUDIO_TOO_LARGE_MESSAGE);
  }
}
