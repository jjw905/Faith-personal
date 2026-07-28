import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

/**
 * 이 서버에 그 프로그램이 있는지.
 *
 * 배포 서버(빌드팩 이미지)에는 ffmpeg도 파이썬 가상환경도 없다. 없는 것을 부르면
 * ENOENT가 그대로 올라와 사용자 요청이 실패한다. 부르기 전에 확인해서 대체
 * 경로로 넘어가려고 쓴다.
 */
export function commandExists(command: string): boolean {
  const value = command.trim();
  if (!value) return false;
  if (value.includes("/") || value.includes("\\")) {
    return existsSync(/* turbopackIgnore: true */ value);
  }
  return (process.env.PATH || "").split(delimiter).some((dir) => {
    if (!dir) return false;
    const candidate = join(dir, value);
    return existsSync(/* turbopackIgnore: true */ candidate);
  });
}

let audioToolsReady: boolean | null = null;

/** 청크 분할에는 ffmpeg와 ffprobe가 둘 다 있어야 한다. */
export function hasAudioTools(): boolean {
  if (audioToolsReady === null) {
    audioToolsReady = commandExists("ffmpeg") && commandExists("ffprobe");
  }
  return audioToolsReady;
}
