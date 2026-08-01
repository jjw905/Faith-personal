import "server-only";

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildObjectKey } from "@/lib/storage/spaces";
import { audioToolPath } from "@/lib/stt/local-tools";
import {
  needsPlaybackNormalize,
  splitFileName,
  vaultFileExtension,
} from "@/lib/vault";

/**
 * 다시듣기용 오디오 정규화.
 *
 * 브라우저는 MP3에 Xing/Info 인덱스가 없으면 seek 위치를 바이트 비율로
 * 추정한다. KTV 업로드본이 그런 VBR MP3라서 말풍선을 눌러 이동하면 소리와
 * 형광펜이 어긋났다. 순차 재생은 멀쩡하고, 같은 자리를 다시 눌러도 결과가
 * 달랐던 이유가 이 추정 오차다.
 *
 * MP4(m4a)는 규격상 샘플 표(stts/stsz)를 갖고 있어 seek이 정확하다.
 * 말소리는 AAC 32kbps mono 16kHz로 충분하고, 용량도 원본보다 줄어든다
 * (KTV 11분 44초 기준 3.61MB → 2.88MB).
 *
 * 업로드 시점에 한 번만 바꾼다. 보관함에 들어간 뒤에 손대면 암호화 재저장과
 * 용량 재계산까지 걸린다.
 */

const PLAYBACK_EXT = ".m4a";
const FFMPEG_TIMEOUT_MS = 10 * 60_000;

export type NormalizedAudio = {
  body: Buffer;
  fileName: string;
  mime: string;
};

/**
 * MP4 샘플 표가 이미 파일 앞에 있는지.
 * 앞에 있으면 손댈 이유가 없다.
 */
function hasFrontMoov(body: Buffer): boolean {
  const moov = body.indexOf("moov", 0, "latin1");
  const mdat = body.indexOf("mdat", 0, "latin1");
  return moov >= 0 && (mdat < 0 || moov < mdat);
}

/**
 * 오디오를 재생·seek에 안전한 m4a로 바꾼다.
 * ffmpeg가 없거나 변환이 실패하면 null. 호출자는 원본을 그대로 올린다.
 */
export function normalizeAudioForPlayback(
  body: Buffer,
  fileName: string,
): NormalizedAudio | null {
  const ext = vaultFileExtension(fileName);
  if (!needsPlaybackNormalize(fileName)) return null;
  // 이미 MP4인 파일을 다시 인코딩하면 소리만 나빠진다. 표 위치만 본다.
  const remuxOnly = ext === PLAYBACK_EXT;
  if (remuxOnly && hasFrontMoov(body)) return null;
  const ffmpeg = audioToolPath("ffmpeg");
  if (!ffmpeg) return null;

  const dir = mkdtempSync(/* turbopackIgnore: true */ join(tmpdir(), "faith-playback-"));
  const input = join(/* turbopackIgnore: true */ dir, `source${ext}`);
  const output = join(/* turbopackIgnore: true */ dir, `playback${PLAYBACK_EXT}`);
  try {
    writeFileSync(/* turbopackIgnore: true */ input, body);
    execFileSync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        input,
        "-vn",
        ...(remuxOnly
          ? ["-c:a", "copy"]
          : ["-c:a", "aac", "-b:a", "32k", "-ar", "16000", "-ac", "1"]),
        // moov를 앞으로 보내야 브라우저가 받자마자 seek할 수 있다.
        "-movflags",
        "+faststart",
        output,
      ],
      { timeout: FFMPEG_TIMEOUT_MS, killSignal: "SIGKILL" },
    );
    const converted = readFileSync(/* turbopackIgnore: true */ output);
    if (converted.length === 0) return null;
    return {
      body: converted,
      fileName: `${splitFileName(fileName).base}${PLAYBACK_EXT}`,
      mime: "audio/mp4",
    };
  } catch {
    // 손상된 파일이나 코덱 미지원. 원본을 그대로 보관한다.
    return null;
  } finally {
    rmSync(/* turbopackIgnore: true */ dir, { recursive: true, force: true });
  }
}

/**
 * 서버 경유 업로드에서 보관함에 넣기 직전에 오디오를 정규화한다.
 * 확장자가 바뀌면 객체 키도 같이 다시 만든다. 키는 사용자·파일 id 접두어만
 * 검증하므로 뒷부분 이름은 새로 지어도 된다.
 */
export function normalizeUploadAudio(params: {
  userId: string;
  id: string;
  key: string;
  fileName: string;
  mime: string;
  body: Buffer;
}): { key: string; fileName: string; mime: string; body: Buffer } {
  const normalized = normalizeAudioForPlayback(params.body, params.fileName);
  if (!normalized) {
    return {
      key: params.key,
      fileName: params.fileName,
      mime: params.mime,
      body: params.body,
    };
  }
  return {
    key: buildObjectKey(params.userId, params.id, normalized.fileName),
    fileName: normalized.fileName,
    mime: normalized.mime,
    body: normalized.body,
  };
}
