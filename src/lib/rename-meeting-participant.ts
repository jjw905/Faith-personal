import type { SemanticStructure } from "@/lib/stt/semantic-structure";
import type { UserMeetingRecord } from "@/lib/user-meetings-store";
import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";

export function initialsFromParticipantName(name: string): string {
  const t = name.trim();
  if (!t) return "?";
  const labeled = t.match(/^화자\s*(.+)$/i);
  const token = (labeled?.[1] ?? t).trim();
  return token.slice(0, 1).toUpperCase() || "?";
}

function replaceExact(value: string, from: string, to: string): string {
  return value === from ? to : value;
}

function mapNames(names: string[] | undefined, from: string, to: string) {
  if (!names?.length) return names;
  return names.map((n) => replaceExact(n, from, to));
}

export function renameInMeeting(
  meeting: Meeting,
  participantId: string,
  from: string,
  to: string,
): Meeting {
  return {
    ...meeting,
    participants: meeting.participants.map((p) => {
      if (p.id !== participantId) return p;
      return {
        ...p,
        name: to,
        initials: initialsFromParticipantName(to),
        recognitionNote: "사용자가 확인한 이름",
      };
    }),
  };
}

export function renameInTranscript(
  transcript: MeetingTranscript,
  from: string,
  to: string,
): MeetingTranscript {
  return {
    ...transcript,
    lines: transcript.lines.map((line) => ({
      ...line,
      speaker: replaceExact(line.speaker, from, to),
    })),
  };
}

export function renameInTimeline(
  timeline: MeetingTimeline,
  from: string,
  to: string,
): MeetingTimeline {
  return {
    ...timeline,
    segments: timeline.segments.map((seg) => ({
      ...seg,
      speakers: mapNames(seg.speakers, from, to),
    })),
    actions: timeline.actions?.map((a) => ({
      ...a,
      owner: replaceExact(a.owner, from, to),
    })),
  };
}

export function renameInSemantic(
  semantic: SemanticStructure,
  from: string,
  to: string,
): SemanticStructure {
  return {
    ...semantic,
    speakers: semantic.speakers.map((s) => ({
      ...s,
      name: replaceExact(s.name, from, to),
    })),
    timeline: semantic.timeline.map((t) => ({
      ...t,
      speakers: mapNames(t.speakers, from, to) ?? [],
    })),
    dialogue: semantic.dialogue.map((d) => ({
      ...d,
      speaker: d.speaker ? replaceExact(d.speaker, from, to) : d.speaker,
    })),
    actions: semantic.actions.map((a) => ({
      ...a,
      owner: replaceExact(a.owner, from, to),
    })),
  };
}

export type RenameParticipantResult =
  | { ok: true; record: UserMeetingRecord }
  | { ok: false; message: string };

/** 참석자 표시명 변경. 참석·대화·타임라인·semantic 화자 라벨을 함께 맞춤. */
export function renameParticipantInRecord(
  record: UserMeetingRecord,
  participantId: string,
  nextNameRaw: string,
): RenameParticipantResult {
  const nextName = nextNameRaw.trim();
  if (!nextName) {
    return { ok: false, message: "이름을 입력해 주세요." };
  }

  const person = record.meeting.participants.find((p) => p.id === participantId);
  if (!person) {
    return { ok: false, message: "참석자를 찾을 수 없습니다." };
  }

  const from = person.name;
  if (from === nextName) {
    return { ok: true, record };
  }

  const duplicate = record.meeting.participants.some(
    (p) => p.id !== participantId && p.name === nextName,
  );
  if (duplicate) {
    return { ok: false, message: "같은 이름의 참석자가 이미 있습니다." };
  }

  return {
    ok: true,
    record: {
      ...record,
      meeting: renameInMeeting(record.meeting, participantId, from, nextName),
      transcript: renameInTranscript(record.transcript, from, nextName),
      timeline: renameInTimeline(record.timeline, from, nextName),
      semantic: record.semantic
        ? renameInSemantic(record.semantic, from, nextName)
        : record.semantic,
    },
  };
}
