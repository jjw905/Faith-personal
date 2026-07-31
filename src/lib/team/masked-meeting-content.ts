import { maskPii } from "@/lib/masking";
import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline, TimelineSegment } from "@/types/timeline";
import type {
  MeetingTranscript,
  TranscriptLine,
} from "@/types/transcript";

function redactText(text: string | undefined, names: string[]) {
  if (!text) return text;
  return maskPii(text, { names, style: "partial" }).masked;
}

function redactTranscriptLine(
  line: TranscriptLine,
  names: string[],
): TranscriptLine {
  return {
    ...line,
    speaker: redactText(line.speaker, names) ?? line.speaker,
    text: redactText(line.text, names),
    attachment: line.attachment
      ? {
          ...line.attachment,
          name: redactText(line.attachment.name, names) ?? line.attachment.name,
        }
      : undefined,
    corrections: line.corrections?.map((correction) => ({
      ...correction,
      wrong: redactText(correction.wrong, names) ?? correction.wrong,
      suggestion:
        redactText(correction.suggestion, names) ?? correction.suggestion,
      reason: redactText(correction.reason, names),
    })),
    memo: redactText(line.memo, names),
    // Word text and offsets describe the original transcript. Do not send
    // either to a masked-only viewer because they can reconstruct the source.
    words: undefined,
  };
}

export function maskTeamTranscript(
  transcript: MeetingTranscript,
  names: string[] = [],
): MeetingTranscript {
  return {
    ...transcript,
    lines: transcript.lines.map((line) => redactTranscriptLine(line, names)),
  };
}

function redactSegment(
  segment: TimelineSegment,
  names: string[],
): TimelineSegment {
  return {
    ...segment,
    title: redactText(segment.title, names) ?? segment.title,
    summary: redactText(segment.summary, names) ?? segment.summary,
    points: segment.points?.map(
      (point) => redactText(point, names) ?? point,
    ),
    speakerNotes: segment.speakerNotes?.map((note) => ({
      ...note,
      name: redactText(note.name, names) ?? note.name,
      said: redactText(note.said, names) ?? note.said,
    })),
    speakers: segment.speakers?.map(
      (speaker) => redactText(speaker, names) ?? speaker,
    ),
  };
}

export function maskTeamTimeline(
  timeline: MeetingTimeline,
  names: string[] = [],
): MeetingTimeline {
  return {
    ...timeline,
    overallSummary:
      redactText(timeline.overallSummary, names) ?? timeline.overallSummary,
    decisions: timeline.decisions?.map(
      (decision) => redactText(decision, names) ?? decision,
    ),
    actions: timeline.actions?.map((action) => ({
      ...action,
      owner: redactText(action.owner, names) ?? action.owner,
      task: redactText(action.task, names) ?? action.task,
      due: redactText(action.due, names),
    })),
    segments: timeline.segments.map((segment) =>
      redactSegment(segment, names),
    ),
  };
}

export function maskTeamMeeting(
  meeting: Meeting,
  names: string[] = [],
): Meeting {
  return {
    ...meeting,
    title: redactText(meeting.title, names) ?? meeting.title,
    participants: meeting.participants.map((participant) => ({
      ...participant,
      name: redactText(participant.name, names) ?? participant.name,
      initials:
        redactText(participant.initials, names) ?? participant.initials,
      recognitionNote: redactText(participant.recognitionNote, names),
      summary: redactText(participant.summary, names),
      tags: participant.tags?.map(
        (tag) => redactText(tag, names) ?? tag,
      ),
    })),
  };
}
