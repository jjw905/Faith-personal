import "server-only";

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { getMeetingById } from "@/lib/meetings-data";
import { prisma } from "@/lib/prisma";
import { getUserMeeting } from "@/lib/user-meetings-store";
import type { Meeting } from "@/types/meeting";
import type { MeetingTranscript } from "@/types/transcript";

const BENCH_ROOT = join(
  /*turbopackIgnore: true*/ process.cwd(),
  ".data",
  "stt-bench",
);

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
export async function resolveReplayAudioFile(meetingId: string): Promise<{
  absolutePath: string;
  label: string;
  mime: string;
} | null> {
  const meeting = await getMeetingById(meetingId);
  const raw = meeting?.replayAudio?.trim();
  if (!raw || raw.startsWith("/")) return null;

  const absolutePath = resolve(/*turbopackIgnore: true*/ BENCH_ROOT, raw);
  if (
    absolutePath !== BENCH_ROOT &&
    !absolutePath.startsWith(`${BENCH_ROOT}/`) &&
    !absolutePath.startsWith(`${BENCH_ROOT}\\`)
  ) {
    return null;
  }
  if (!existsSync(/*turbopackIgnore: true*/ absolutePath)) return null;
  return {
    absolutePath,
    label: meeting?.title ? `${meeting.title} 다시듣기` : "다시듣기",
    mime: mimeForAudioPath(absolutePath),
  };
}

/**
 * 대화기록 다시듣기용 오디오 URL.
 * 보관함 원본 → meeting.replayAudio(벤치/공개 샘플).
 * 첨부 파일명·해시 샘플로 긴 타임라인을 가짜 매칭하지 않음.
 */
export async function resolveMeetingReplayAudio(input: {
  meeting: Meeting;
  transcript: MeetingTranscript;
}): Promise<{ src: string; label: string } | null> {
  const { meeting } = input;
  const row = await getUserMeeting(meeting.id);
  if (row?.vaultFileId) {
    const file = await prisma.vaultFile.findFirst({
      where: { id: row.vaultFileId, userId: row.userId },
      select: { id: true },
    });
    if (file) {
      return {
        // 보관함 API는 업로더 본인만 읽을 수 있다. 팀원 재생은 이미 확인한
        // 회의 열람 권한으로 원본을 중계하는 회의 API를 사용한다.
        src: `/api/meetings/${meeting.id}/replay-audio`,
        label: "다시듣기",
      };
    }
  }

  const replay = meeting.replayAudio?.trim();
  if (!replay) return null;

  if (replay.startsWith("/samples/")) {
    return {
      src: replay,
      label: "다시듣기",
    };
  }

  if (!(await resolveReplayAudioFile(meeting.id))) return null;

  return {
    src: `/api/meetings/${meeting.id}/replay-audio`,
    label: "다시듣기",
  };
}
