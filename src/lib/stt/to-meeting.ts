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
import {
  assignWordTimingsToLines,
  mapTimelineByDialogue,
  mapTimelineByTimedSegments,
} from "@/lib/stt/timed-segments";
import type { TimedSegment, WordTiming } from "@/lib/stt/timed-segments";
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

/**
 * 화자 분리가 닿지 않은 일부 구간에 쓰는 기본값이다. 사람의 이름이나 별도
 * 화자 클러스터가 아니므로, 실제 라벨이 한 명뿐인 회의에서는 그 사람에게
 * 합쳐 보여야 한다.
 */
const GENERIC_SPEAKER_NAME = "발화";

function buildTimelineFromSemantic(
  sem: SemanticStructure,
  durationSec: number,
  timedSegments?: TimedSegment[],
): TimelineSegment[] {
  const onlyNamedSpeaker = singleNamedSpeaker(sem);
  const dialogue = displayDialogueSpeakers(sem, onlyNamedSpeaker);
  const items = sem.timeline.filter((t) => t.title || t.summary);
  if (items.length === 0) {
    const speakers = displaySpeakerNames(
      sem,
      dialogue.map((d) => d.speaker),
      onlyNamedSpeaker,
    );
    return [
      {
        id: "s1",
        start: formatClock(0),
        end: formatClock(durationSec),
        title: "전체",
        summary: sem.overallSummary.slice(0, 160),
        kind: "discussion",
        speakers:
          speakers.length > 0 ? speakers : [GENERIC_SPEAKER_NAME],
      },
    ];
  }

  const mappedItems = items.map((t) => ({
    title: t.title,
    summary: t.summary,
    speakers: displaySpeakerNames(sem, t.speakers, onlyNamedSpeaker),
    kind: t.kind,
    points: t.points,
    speakerNotes: t.speakerNotes?.map((note) => ({
      ...note,
      name:
        canonicalSpeakerName(sem, note.name, onlyNamedSpeaker) ?? note.name,
    })),
  }));

  // 대화기록은 이미 실측 시각으로 정렬돼 있다. 구간 경계도 같은 기준을 써야
  // 대화 줄과 구간이 서로 어긋나지 않는다.
  if (dialogue.length > 0) {
    return mapTimelineByDialogue({
      items: mappedItems,
      dialogue,
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
    dialogue,
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
  if (order.length === 0) order.push(GENERIC_SPEAKER_NAME);
  return order;
}

function isGenericSpeakerName(name: string) {
  return name.trim() === GENERIC_SPEAKER_NAME;
}

/**
 * 기본값 "발화"는 실명이 붙지 않은 구간을 뜻할 뿐 별도 사람을 뜻하지 않는다.
 * 따라서 구체적인 라벨이 정확히 하나인 경우에만 기본값을 그 라벨로 흡수한다.
 * 두 개 이상 라벨이 있으면 "발화" 구간의 정체를 추정하지 않고 그대로 둔다.
 */
function collapseGenericSpeakerForSingleNamedVoice(names: string[]): string[] {
  const named = names.filter((name) => !isGenericSpeakerName(name));
  return named.length === 1 ? named : names;
}

function singleNamedSpeakerFromNames(
  rawNames: Array<string | undefined>,
): string | undefined {
  const names = [
    ...new Set(
      rawNames
        .map((name) => name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const named = names.filter((name) => !isGenericSpeakerName(name));
  return named.length === 1 ? named[0] : undefined;
}

/**
 * 사용자에게 보여 줄 화자 수는 최종 evidence dialogue에 실제로 붙은 라벨만
 * 근거로 삼는다. 요약 모델의 speakers/timeline/actions는 화자분리 결과가
 * 아니므로, 그 값만으로 참석자를 만들면 화자분리를 끈 빠른 모드도 2명으로
 * 보이는 거짓 양성이 생긴다.
 */
function collectGroundedSpeakerNames(sem: SemanticStructure): string[] {
  const dialogueNames = [
    ...new Set(
      sem.dialogue
        .map((line) => line.speaker?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const names =
    dialogueNames.length > 0 ? dialogueNames : collectSpeakerNames(sem);
  return collapseGenericSpeakerForSingleNamedVoice(names);
}

function singleNamedSpeaker(sem: SemanticStructure): string | undefined {
  const names = collectGroundedSpeakerNames(sem);
  return names.length === 1 && !isGenericSpeakerName(names[0]!)
    ? names[0]
    : undefined;
}

/** 한 명으로 확정된 회의에서만 기본 "발화" 라벨을 그 사람으로 치환한다. */
function canonicalSpeakerName(
  sem: SemanticStructure,
  rawName: string | undefined,
  onlyNamedSpeaker: string | undefined = singleNamedSpeaker(sem),
): string | undefined {
  const name = rawName?.trim();
  if (!name) return undefined;
  return onlyNamedSpeaker && isGenericSpeakerName(name)
    ? onlyNamedSpeaker
    : name;
}

function displaySpeakerNames(
  sem: SemanticStructure,
  rawNames: Array<string | undefined>,
  onlyNamedSpeaker: string | undefined = singleNamedSpeaker(sem),
): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const rawName of rawNames) {
    const name = canonicalSpeakerName(sem, rawName, onlyNamedSpeaker);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function displayDialogueSpeakers(
  sem: SemanticStructure,
  onlyNamedSpeaker: string | undefined = singleNamedSpeaker(sem),
): SemanticStructure["dialogue"] {
  return sem.dialogue.map((line) => {
    const speaker = canonicalSpeakerName(sem, line.speaker, onlyNamedSpeaker);
    return speaker && speaker !== line.speaker ? { ...line, speaker } : line;
  });
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
function actionHints(
  sem: SemanticStructure,
  name: string,
  onlyNamedSpeaker: string | undefined = singleNamedSpeaker(sem),
): string[] {
  return sem.actions
    .filter(
      (a) =>
        canonicalSpeakerName(sem, a.owner, onlyNamedSpeaker) === name &&
        a.task,
    )
    .map((a) => a.task);
}

export function buildParticipantsFromSemantic(
  sem: SemanticStructure,
): Participant[] {
  const names = collectGroundedSpeakerNames(sem);
  const contrib = contributionByName(sem);
  const onlyNamedSpeaker = singleNamedSpeaker(sem);

  return names.map((name, i) => {
    const c =
      contrib.get(name) ??
      (name === onlyNamedSpeaker
        ? contrib.get(GENERIC_SPEAKER_NAME)
        : undefined);
    const tasks = actionHints(sem, name, onlyNamedSpeaker);
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

    if (name === GENERIC_SPEAKER_NAME) {
      return {
        ...SPEAKER,
        summary: summary || sem.overallSummary.slice(0, 72),
        tags: tags?.length ? tags : undefined,
      };
    }

    // 대화 속 호명으로 실명을 찾은 화자는 라벨로 되돌리지 않는다.
    const isLabel = /^화자\s*/.test(name) || /^[A-Za-z0-9]{1,3}$/.test(name);
    if (!isLabel) {
      return {
        id: `spk-${i}`,
        name,
        initials: name.slice(0, 1),
        color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
        isMember: false,
        recognition: "voice" as const,
        recognitionNote: "대화 속 호명으로 추정",
        summary,
        tags,
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

/**
 * 이미 저장된 회의록도 새 분석을 돌리지 않고 같은 표시 규칙으로 읽는다.
 * 이 함수는 저장된 원문·semantic을 바꾸지 않으며, 화면에 넘길 파생 데이터만
 * 정규화한다.
 */
export function normalizeSingleSpeakerMeetingPresentation(params: {
  semantic?: SemanticStructure | null;
  meeting: Meeting;
  transcript: MeetingTranscript;
  timeline: MeetingTimeline;
}): {
  meeting: Meeting;
  transcript: MeetingTranscript;
  timeline: MeetingTimeline;
} {
  const sem = params.semantic;
  const onlyNamedSpeaker = sem
    ? singleNamedSpeaker(sem)
    : singleNamedSpeakerFromNames(
        params.transcript.lines.map((line) => line.speaker),
      );
  if (!onlyNamedSpeaker) {
    return {
      meeting: params.meeting,
      transcript: params.transcript,
      timeline: params.timeline,
    };
  }

  const hasNamedParticipant = params.meeting.participants.some(
    (participant) => participant.name.trim() === onlyNamedSpeaker,
  );
  const canonicalDisplaySpeakerName = (rawName: string | undefined) => {
    const name = rawName?.trim();
    if (!name) return undefined;
    return isGenericSpeakerName(name) ? onlyNamedSpeaker : name;
  };
  const canonicalDisplaySpeakerNames = (
    rawNames: Array<string | undefined>,
  ) => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const rawName of rawNames) {
      const name = canonicalDisplaySpeakerName(rawName);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
    return names;
  };
  const seenParticipantNames = new Set<string>();
  const participants = params.meeting.participants.flatMap((participant) => {
    // 이미 실제 라벨이 있으면 기본값 참가자는 버린다. 기본값밖에 없는 옛
    // 기록만 실제 라벨로 바꿔 보존한다.
    if (hasNamedParticipant && isGenericSpeakerName(participant.name)) {
      return [];
    }
    const name = canonicalDisplaySpeakerName(participant.name) ?? participant.name;
    if (seenParticipantNames.has(name)) return [];
    seenParticipantNames.add(name);
    if (name === participant.name) return [participant];

    const token = name.replace(/^화자\s*/i, "").trim() || name;
    return [
      {
        ...participant,
        name,
        initials: token.slice(0, 1).toUpperCase(),
      },
    ];
  });

  const transcript: MeetingTranscript = {
    ...params.transcript,
    lines: params.transcript.lines.map((line) => ({
      ...line,
      speaker: canonicalDisplaySpeakerName(line.speaker) ?? line.speaker,
    })),
  };
  const timeline: MeetingTimeline = {
    ...params.timeline,
    actions: params.timeline.actions?.map((action) => ({
      ...action,
      owner: canonicalDisplaySpeakerName(action.owner) ?? action.owner,
    })),
    segments: params.timeline.segments.map((segment) => ({
      ...segment,
      speakers: segment.speakers
        ? canonicalDisplaySpeakerNames(segment.speakers)
        : segment.speakers,
      speakerNotes: segment.speakerNotes?.map((note) => ({
        ...note,
        name: canonicalDisplaySpeakerName(note.name) ?? note.name,
      })),
    })),
  };

  return {
    meeting: { ...params.meeting, participants },
    transcript,
    timeline,
  };
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

  const groundedSpeakers = collectGroundedSpeakerNames(sem);
  const onlyNamedSpeaker = singleNamedSpeaker(sem);
  const single = groundedSpeakers.length <= 1;

  return dialogue.map((d, i) => {
    const startSec = Math.max(
      0,
      Math.min(durationSec, Number.isFinite(d.startSec) ? d.startSec : 0),
    );
    const segmentId = segmentIdForTime(startSec, timelineSegments);
    const speaker =
      canonicalSpeakerName(sem, d.speaker, onlyNamedSpeaker) ||
      (single
        ? groundedSpeakers[0] || GENERIC_SPEAKER_NAME
        : GENERIC_SPEAKER_NAME);
    return {
      id: `l${i + 1}`,
      time: formatClock(startSec),
      startSec: Math.round(startSec * 100) / 100,
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

/**
 * 구간 경계 시각. 내림한 표시 문자열이 아니라 실수 초를 쓴다.
 * 문자열을 쓰면 경계 직전 줄이 다음 구간으로 밀려 한 칸 앞서 보인다.
 */
function segmentStartSec(seg: TimelineSegment): number {
  return typeof seg.startSec === "number" && Number.isFinite(seg.startSec)
    ? seg.startSec
    : parseClockToSec(seg.start);
}

/** 대화 시각이 속한 타임라인 구간. even 분할식 사용 금지. */
function segmentIdForTime(
  startSec: number,
  segments: TimelineSegment[],
): string {
  if (segments.length === 0) return "s1";
  if (startSec <= segmentStartSec(segments[0]!)) {
    return segments[0]!.id;
  }
  for (let i = 0; i < segments.length; i++) {
    const a = segmentStartSec(segments[i]!);
    const b =
      i + 1 < segments.length
        ? segmentStartSec(segments[i + 1]!)
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
  /** 있으면 각 대화 줄에 단어 단위 실측 시각을 배정한다(재생 하이라이트용). */
  wordTimings?: WordTiming[];
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
  let lines = buildTranscriptFromSemantic(
    input.semantic,
    input.durationSec,
    timelineSegments,
  );
  if (input.wordTimings?.length) {
    lines = assignWordTimingsToLines(lines, input.wordTimings, input.durationSec);
  }
  const participants = buildParticipantsFromSemantic(input.semantic);
  const onlyNamedSpeaker = singleNamedSpeaker(input.semantic);

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
          owner:
            canonicalSpeakerName(
              input.semantic,
              a.owner,
              onlyNamedSpeaker,
            ) ?? a.owner,
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
  /** 업로드 직후 ffprobe 등으로 미리 알아낸 길이(초). 없으면 분석 중엔 길이를 표시하지 않는다. */
  durationSec?: number;
}): {
  meeting: Meeting;
  transcript: MeetingTranscript;
  timeline: MeetingTimeline;
} {
  const durationLabel =
    typeof params.durationSec === "number" && params.durationSec > 0
      ? formatDurationLabel(params.durationSec)
      : "";
  return {
    meeting: {
      id: params.meetingId,
      title: params.title,
      tags: ["받아쓰기", "처리중"],
      summaryTags: [],
      date: params.date?.trim() || new Date().toISOString(),
      duration: durationLabel,
      participants: [SPEAKER],
      status: "in_progress",
      security: "protected",
      workspace: params.workspace ?? "personal",
      capture: params.capture ?? "upload",
    },
    transcript: { meetingId: params.meetingId, lines: [] },
    timeline: {
      meetingId: params.meetingId,
      durationLabel,
      overallSummary: "받아쓰기와 요약을 준비하는 중입니다.",
      segments: [],
    },
  };
}
