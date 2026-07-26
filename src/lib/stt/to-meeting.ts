import {
  aiSpeakerLabel,
  formatClock,
  formatDurationLabel,
} from "@/lib/diarize-meeting";
import type { Meeting, Participant } from "@/types/meeting";
import type { MeetingTimeline, TimelineSegment } from "@/types/timeline";
import type { MeetingTranscript, TranscriptLine } from "@/types/transcript";
import type {
  SemanticSpeakerContribution,
  SemanticStructure,
} from "@/lib/stt/semantic-structure";
import {
  composeDisplaySummary,
  keywordsFromSemantic,
} from "@/lib/stt/semantic-structure";
import { mapTimelineByDialogue, mapTimelineByTimedSegments } from "@/lib/stt/timed-segments";
import type { TimedSegment } from "@/lib/stt/timed-segments";
import type { WorkspaceId } from "@/lib/workspaces";

const SPEAKER_COLORS = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-slate-500",
] as const;

const SPEAKER: Participant = {
  id: "spk-voice",
  name: "발화",
  initials: "발",
  color: "bg-slate-500",
  isMember: false,
  recognition: "voice",
  recognitionNote: "화자 분리 없음",
};

function buildTimelineFromSemantic(
  sem: SemanticStructure,
  durationSec: number,
  timedSegments?: TimedSegment[],
): TimelineSegment[] {
  const items = sem.timeline.filter((t) => t.title || t.summary);
  if (items.length === 0) {
    const speakers = [
      ...new Set(
        sem.dialogue.map((d) => d.speaker).filter(Boolean) as string[],
      ),
    ];
    return [
      {
        id: "s1",
        start: formatClock(0),
        end: formatClock(durationSec),
        title: "전체",
        summary: sem.overallSummary.slice(0, 160),
        kind: "discussion",
        speakers: speakers.length > 0 ? speakers : ["발화"],
      },
    ];
  }

  const mappedItems = items.map((t) => ({
    title: t.title,
    summary: t.summary,
    speakers: t.speakers,
    kind: t.kind,
  }));

  // 대화기록은 이미 실측 시각으로 정렬돼 있다. 구간 경계도 같은 기준을 써야
  // 대화 줄과 구간이 서로 어긋나지 않는다.
  if (sem.dialogue.length > 0) {
    return mapTimelineByDialogue({
      items: mappedItems,
      dialogue: sem.dialogue,
      durationSec,
    });
  }

  if (timedSegments && timedSegments.length > 0) {
    return mapTimelineByTimedSegments({
      items: mappedItems,
      timed: timedSegments,
      durationSec,
    });
  }

  return mapTimelineByDialogue({
    items: mappedItems,
    dialogue: sem.dialogue,
    durationSec,
  });
}

function collectSpeakerNames(sem: SemanticStructure): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    const n = name.trim();
    if (!n || seen.has(n)) return;
    seen.add(n);
    order.push(n);
  };
  for (const s of sem.speakers) push(s.name);
  for (const t of sem.timeline) {
    for (const sp of t.speakers) push(sp);
  }
  for (const d of sem.dialogue) {
    if (d.speaker) push(d.speaker);
  }
  for (const a of sem.actions) {
    if (a.owner) push(a.owner);
  }
  if (order.length === 0) order.push("발화");
  return order;
}

function contributionByName(
  sem: SemanticStructure,
): Map<string, SemanticSpeakerContribution> {
  const map = new Map<string, SemanticSpeakerContribution>();
  for (const s of sem.speakers) {
    map.set(s.name, s);
  }
  return map;
}

/** 액션 owner 매칭으로 요약 보강. */
function actionHints(sem: SemanticStructure, name: string): string[] {
  return sem.actions
    .filter((a) => a.owner === name && a.task)
    .map((a) => a.task);
}

export function buildParticipantsFromSemantic(
  sem: SemanticStructure,
): Participant[] {
  const names = collectSpeakerNames(sem);
  const contrib = contributionByName(sem);

  return names.map((name, i) => {
    const c = contrib.get(name);
    const tasks = actionHints(sem, name);
    const summary =
      c?.summary ||
      (tasks.length > 0 ? tasks.slice(0, 2).join(", ") : undefined);
    const tags = c?.tags?.length
      ? c.tags
      : tasks.length > 0
        ? tasks
            .slice(0, 2)
            .map((t) => t.split(/\s+/)[0] || t)
            .filter(Boolean)
            .slice(0, 2)
        : undefined;

    if (name === "발화") {
      return {
        ...SPEAKER,
        summary: summary || sem.overallSummary.slice(0, 72),
        tags: tags?.length ? tags : undefined,
      };
    }

    const label = name.startsWith("화자") ? name : aiSpeakerLabel(name);
    const token = label.replace(/^화자\s*/i, "").trim() || String.fromCharCode(65 + i);
    return {
      id: `spk-${token}`,
      name: label,
      initials: token.slice(0, 1).toUpperCase(),
      color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
      isMember: false,
      recognition: "voice" as const,
      recognitionNote: "AI 화자 분리 라벨",
      summary,
      tags,
    };
  });
}

function buildTranscriptFromSemantic(
  sem: SemanticStructure,
  durationSec: number,
  timelineSegments: TimelineSegment[],
): TranscriptLine[] {
  const dialogue = sem.dialogue.filter((d) => d.text.trim());
  if (dialogue.length === 0) {
    return [];
  }

  const single = collectSpeakerNames(sem).length <= 1;

  return dialogue.map((d, i) => {
    const startSec = Math.max(
      0,
      Math.min(durationSec, Number.isFinite(d.startSec) ? d.startSec : 0),
    );
    const segmentId = segmentIdForTime(startSec, timelineSegments);
    const speaker =
      d.speaker ||
      (single ? collectSpeakerNames(sem)[0] || "발화" : "발화");
    return {
      id: `l${i + 1}`,
      time: formatClock(startSec),
      speaker,
      text: d.text.trim(),
      segmentId,
    };
  });
}

function parseClockToSec(clock: string): number {
  const [mm, ss] = clock.split(":").map(Number);
  return (mm || 0) * 60 + (ss || 0);
}

/** 대화 시각이 속한 타임라인 구간. even 분할식 사용 금지. */
function segmentIdForTime(
  startSec: number,
  segments: TimelineSegment[],
): string {
  if (segments.length === 0) return "s1";
  if (startSec <= parseClockToSec(segments[0]!.start)) {
    return segments[0]!.id;
  }
  for (let i = 0; i < segments.length; i++) {
    const a = parseClockToSec(segments[i]!.start);
    const b =
      i + 1 < segments.length
        ? parseClockToSec(segments[i + 1]!.start)
        : Number.POSITIVE_INFINITY;
    if (startSec >= a && startSec < b) return segments[i]!.id;
  }
  return segments[segments.length - 1]!.id;
}

export type BuildMeetingFromSttInput = {
  meetingId: string;
  title: string;
  durationSec: number;
  rawText: string;
  semantic: SemanticStructure;
  timedSegments?: TimedSegment[];
  workspace?: WorkspaceId;
  tags?: string[];
  summaryTags?: string[];
  /** 미지정 시 처리 완료 시각. 업로드 흐름에서는 createdAt 전달. */
  date?: string;
  capture?: Meeting["capture"];
};

export function buildMeetingFromStt(input: BuildMeetingFromSttInput): {
  meeting: Meeting;
  transcript: MeetingTranscript;
  timeline: MeetingTimeline;
} {
  const durationLabel = formatDurationLabel(input.durationSec);
  const timelineSegments = buildTimelineFromSemantic(
    input.semantic,
    input.durationSec,
    input.timedSegments,
  );
  const lines = buildTranscriptFromSemantic(
    input.semantic,
    input.durationSec,
    timelineSegments,
  );
  const participants = buildParticipantsFromSemantic(input.semantic);

  const topicKeywords = keywordsFromSemantic(input.semantic, 5);
  const meetingDate = input.date?.trim() || new Date().toISOString();
  const meeting: Meeting = {
    id: input.meetingId,
    title: input.title,
    tags: input.tags?.length ? input.tags : topicKeywords,
    summaryTags: input.summaryTags?.length
      ? input.summaryTags
      : topicKeywords.slice(0, 3),
    date: meetingDate,
    duration: durationLabel,
    participants,
    status: "completed",
    security: "protected",
    workspace: input.workspace ?? "personal",
    capture: input.capture,
  };

  return {
    meeting,
    transcript: { meetingId: input.meetingId, lines },
    timeline: {
      meetingId: input.meetingId,
      durationLabel,
      overallSummary: composeDisplaySummary(input.semantic),
      decisions: input.semantic.decisions.filter(Boolean),
      actions: input.semantic.actions
        .filter((a) => a.task.trim())
        .map((a) => ({
          owner: a.owner,
          task: a.task,
          due: a.due || undefined,
        })),
      segments: timelineSegments,
    },
  };
}

export function placeholderMeeting(params: {
  meetingId: string;
  title: string;
  workspace?: WorkspaceId;
  /** 미지정 시 업로드(호출) 시각 */
  date?: string;
  capture?: Meeting["capture"];
}): {
  meeting: Meeting;
  transcript: MeetingTranscript;
  timeline: MeetingTimeline;
} {
  return {
    meeting: {
      id: params.meetingId,
      title: params.title,
      tags: ["STT", "처리중"],
      summaryTags: [],
      date: params.date?.trim() || new Date().toISOString(),
      duration: "—",
      participants: [SPEAKER],
      status: "in_progress",
      security: "protected",
      workspace: params.workspace ?? "personal",
      capture: params.capture ?? "upload",
    },
    transcript: { meetingId: params.meetingId, lines: [] },
    timeline: {
      meetingId: params.meetingId,
      durationLabel: "—",
      overallSummary: "받아쓰기와 요약을 준비하는 중입니다.",
      segments: [],
    },
  };
}
