import { maskPii, type MaskStyle } from "@/lib/masking";
import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline, TimelineSegment } from "@/types/timeline";
import type {
  MeetingTranscript,
  TranscriptLine,
} from "@/types/transcript";

function redactText(
  text: string | undefined,
  names: string[],
  style: MaskStyle,
) {
  if (!text) return text;
  return maskPii(text, { names, style }).masked;
}

function redactTranscriptLine(
  line: TranscriptLine,
  names: string[],
  style: MaskStyle,
): TranscriptLine {
  return {
    ...line,
    speaker: redactText(line.speaker, names, style) ?? line.speaker,
    text: redactText(line.text, names, style),
    attachment: line.attachment
      ? {
          ...line.attachment,
          name:
            redactText(line.attachment.name, names, style) ??
            line.attachment.name,
        }
      : undefined,
    corrections: line.corrections?.map((correction) => ({
      ...correction,
      wrong: redactText(correction.wrong, names, style) ?? correction.wrong,
      suggestion:
        redactText(correction.suggestion, names, style) ??
        correction.suggestion,
      reason: redactText(correction.reason, names, style),
    })),
    memo: redactText(line.memo, names, style),
    // Word text and offsets describe the original transcript. Do not send
    // either to a masked-only viewer because they can reconstruct the source.
    words: undefined,
  };
}

export function maskTeamTranscript(
  transcript: MeetingTranscript,
  names: string[] = [],
  style: MaskStyle = "partial",
): MeetingTranscript {
  return {
    ...transcript,
    lines: transcript.lines.map((line) =>
      redactTranscriptLine(line, names, style),
    ),
  };
}

function redactSegment(
  segment: TimelineSegment,
  names: string[],
  style: MaskStyle,
): TimelineSegment {
  return {
    ...segment,
    title: redactText(segment.title, names, style) ?? segment.title,
    summary: redactText(segment.summary, names, style) ?? segment.summary,
    points: segment.points?.map(
      (point) => redactText(point, names, style) ?? point,
    ),
    speakerNotes: segment.speakerNotes?.map((note) => ({
      ...note,
      name: redactText(note.name, names, style) ?? note.name,
      said: redactText(note.said, names, style) ?? note.said,
    })),
    speakers: segment.speakers?.map(
      (speaker) => redactText(speaker, names, style) ?? speaker,
    ),
  };
}

export function maskTeamTimeline(
  timeline: MeetingTimeline,
  names: string[] = [],
  style: MaskStyle = "partial",
): MeetingTimeline {
  return {
    ...timeline,
    overallSummary:
      redactText(timeline.overallSummary, names, style) ??
      timeline.overallSummary,
    decisions: timeline.decisions?.map(
      (decision) => redactText(decision, names, style) ?? decision,
    ),
    actions: timeline.actions?.map((action) => ({
      ...action,
      owner: redactText(action.owner, names, style) ?? action.owner,
      task: redactText(action.task, names, style) ?? action.task,
      due: redactText(action.due, names, style),
    })),
    segments: timeline.segments.map((segment) =>
      redactSegment(segment, names, style),
    ),
  };
}

export function maskTeamMeeting(
  meeting: Meeting,
  names: string[] = [],
  style: MaskStyle = "partial",
): Meeting {
  return {
    ...meeting,
    title: redactText(meeting.title, names, style) ?? meeting.title,
    participants: meeting.participants.map((participant) => ({
      ...participant,
      name: redactText(participant.name, names, style) ?? participant.name,
      initials:
        redactText(participant.initials, names, style) ??
        participant.initials,
      recognitionNote: redactText(
        participant.recognitionNote,
        names,
        style,
      ),
      summary: redactText(participant.summary, names, style),
      tags: participant.tags?.map(
        (tag) => redactText(tag, names, style) ?? tag,
      ),
    })),
  };
}
