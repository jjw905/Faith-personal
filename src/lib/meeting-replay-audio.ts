import "server-only";

import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { getMeetingById } from "@/lib/meetings-data";
import { getUserMeeting } from "@/lib/user-meetings-store";
import type { Meeting } from "@/types/meeting";
import type { MeetingTranscript } from "@/types/transcript";

const BENCH_ROOT = join(process.cwd(), ".data", "stt-bench");

function mimeForAudioPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  return "audio/mpeg";
}

/**
 * meeting.replayAudio → 로컬 벤치 파일.
 * path traversal 방지: `.data/stt-bench` 아래 basename만.
 */
export function resolveReplayAudioFile(meetingId: string): {
  absolutePath: string;
  label: string;
  mime: string;
} | null {
  const meeting = getMeetingById(meetingId);
  const raw = meeting?.replayAudio?.trim();
  if (!raw || raw.startsWith("/")) return null;

  const absolutePath = resolve(BENCH_ROOT, raw);
  if (
    absolutePath !== BENCH_ROOT &&
    !absolutePath.startsWith(`${BENCH_ROOT}/`) &&
    !absolutePath.startsWith(`${BENCH_ROOT}\\`)
  ) {
    return null;
  }
  if (!existsSync(absolutePath)) return null;
  return {
    absolutePath,
    label: meeting?.title ? `${meeting.title} 녹음` : "회의 녹음",
    mime: mimeForAudioPath(absolutePath),
  };
}

/**
 * 대화기록 다시듣기용 오디오 URL.
 * 보관함 원본 → meeting.replayAudio(벤치/공개 샘플).
 * 첨부 파일명·해시 샘플로 긴 타임라인을 가짜 매칭하지 않음.
 */
export function resolveMeetingReplayAudio(input: {
  meeting: Meeting;
  transcript: MeetingTranscript;
}): { src: string; label: string } | null {
  const { meeting } = input;
  const row = getUserMeeting(meeting.id);
  if (row?.vaultFileId) {
    return {
      src: `/api/vault/${row.vaultFileId}/content`,
      label: "회의 녹음",
    };
  }

  const replay = meeting.replayAudio?.trim();
  if (!replay) return null;

  if (replay.startsWith("/samples/")) {
    return {
      src: replay,
      label: basename(replay) || "회의 녹음",
    };
  }

  if (!resolveReplayAudioFile(meeting.id)) return null;

  return {
    src: `/api/meetings/${meeting.id}/replay-audio`,
    label: meeting.title ? `${meeting.title} 녹음` : "회의 녹음",
  };
}
