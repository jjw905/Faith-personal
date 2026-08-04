import { buildEvidenceDialogue } from "../src/lib/stt/transcript-evidence";
import { mergeReconciledTranscriptParts } from "../src/lib/stt/transcript-reconcile";
import {
  buildMeetingFromStt,
  buildParticipantsFromSemantic,
  normalizeSingleSpeakerMeetingPresentation,
} from "../src/lib/stt/to-meeting";
import { activeWordFocusAt } from "../src/lib/transcript-time";
import { repairShortTurnProtocols } from "../src/lib/stt/speaker-turns";
import type { SemanticStructure } from "../src/lib/stt/semantic-structure";

const text =
  "안녕하세요. 첫 번째 원문입니다.\n두 번째 줄은 모델이 고치면 안 됩니다. 마지막 발화입니다.";
const dialogue = buildEvidenceDialogue({
  text,
  durationSec: 9,
  timedSegments: [
    { startSec: 0, endSec: 3, text: "안녕하세요 첫 번째 원문입니다" },
    { startSec: 4, endSec: 7, text: "두 번째 줄은 모델이 고치면 안 됩니다" },
    { startSec: 7.2, endSec: 9, text: "마지막 발화입니다" },
  ],
});
const dense = (value: string) => value.replace(/[^0-9A-Za-z가-힣]/g, "");
if (dense(dialogue.map((line) => line.text).join(" ")) !== dense(text)) {
  throw new Error("대화 원문이 불변 근거와 다릅니다.");
}
if (dialogue.some((line, index) => index > 0 && line.startSec < dialogue[index - 1]!.startSec)) {
  throw new Error("대화 시간이 역행합니다.");
}

const longSpeakerText =
  "첫 번째 화자가 긴 설명을 시작합니다. 같은 사람이 두 번째 내용을 이어서 설명합니다. " +
  "이 문장도 같은 화자의 근거를 유지해야 합니다.";
const secondSpeakerText =
  "두 번째 화자가 시연을 시작합니다. 마지막 설명까지 별도 말풍선으로 나뉩니다.";
const speakerText = `${longSpeakerText} ${secondSpeakerText}`;
const speakerDialogue = buildEvidenceDialogue({
  text: speakerText,
  durationSec: 20,
  timedSegments: [
    { startSec: 0, endSec: 12, text: longSpeakerText },
    { startSec: 13, endSec: 20, text: secondSpeakerText },
  ],
  speakerBlocks: [
    { startSec: 0, endSec: 12, speaker: "화자 A", text: longSpeakerText },
    { startSec: 13, endSec: 20, speaker: "화자 B", text: secondSpeakerText },
  ],
});
if (speakerDialogue.length !== 2) {
  throw new Error("같은 화자의 연속 문장이 읽기 단위 말풍선으로 묶이지 않았습니다.");
}
if (
  speakerDialogue.some((line) =>
    line.startSec < 13 ? line.speaker !== "화자 A" : line.speaker !== "화자 B",
  )
) {
  throw new Error("말풍선을 나누는 동안 화자 근거가 바뀌었습니다.");
}
if (dense(speakerDialogue.map((line) => line.text).join(" ")) !== dense(speakerText)) {
  throw new Error("화자 말풍선 분할이 PRIMARY 원문을 변경했습니다.");
}

const semantic = {
  overallSummary: "실제 대화는 화자분리 없이 저장됐습니다.",
  keywords: [],
  timeline: [
    {
      title: "요약 모델 추정",
      summary: "근거 없는 화자 이름",
      speakers: ["화자 A", "화자 B"],
      kind: "discussion",
      points: [],
      speakerNotes: [],
    },
  ],
  decisions: [],
  actions: [],
  speakers: [
    { name: "화자 A", summary: "", tags: [] },
    { name: "화자 B", summary: "", tags: [] },
  ],
  dialogue: [{ startSec: 0, speaker: "발화", text: "실제 근거" }],
  topicBucket: "other",
} satisfies SemanticStructure;
const participants = buildParticipantsFromSemantic(semantic);
if (participants.length !== 1 || participants[0]?.name !== "발화") {
  throw new Error("요약 모델의 근거 없는 화자가 참석자 목록에 노출됩니다.");
}

// diarization의 기본 "발화"는 다른 사람이 아니라 화자 라벨을 붙이지 못한
// 구간이다. 실제 라벨이 한 명뿐이면 참석자·대화·타임라인 모두 그 한 사람으로
// 보여야 한다.
const singleSpeakerWithGenericFallback = {
  overallSummary: "한 사람이 발표한 내용입니다.",
  keywords: [],
  timeline: [
    {
      title: "발표",
      summary: "화자 A가 처음부터 끝까지 설명했습니다.",
      speakers: ["화자 A", "발화"],
      kind: "discussion",
      points: [],
      speakerNotes: [{ name: "발화", said: "계속 설명" }],
    },
  ],
  decisions: [],
  actions: [{ owner: "발화", task: "자료를 공유한다", due: "" }],
  speakers: [
    { name: "화자 A", summary: "발표를 진행", tags: [] },
    { name: "발화", summary: "기본값 구간", tags: ["공유"] },
  ],
  dialogue: [
    { startSec: 0, speaker: "화자 A", text: "첫 번째 설명입니다." },
    { startSec: 4, speaker: "발화", text: "이어서 설명합니다." },
    { startSec: 8, text: "마무리 설명입니다." },
  ],
  topicBucket: "other",
} satisfies SemanticStructure;
const singleSpeakerMeeting = buildMeetingFromStt({
  meetingId: "single-speaker-generic-fallback",
  title: "한 명 발표",
  durationSec: 12,
  rawText: "첫 번째 설명입니다. 이어서 설명합니다. 마무리 설명입니다.",
  semantic: singleSpeakerWithGenericFallback,
});
if (
  singleSpeakerMeeting.meeting.participants.length !== 1 ||
  singleSpeakerMeeting.meeting.participants[0]?.name !== "화자 A"
) {
  throw new Error("한 명 화자 회의가 참석자 목록에서 둘로 나뉩니다.");
}
if (singleSpeakerMeeting.transcript.lines.some((line) => line.speaker !== "화자 A")) {
  throw new Error("한 명 화자 회의의 대화 줄에 기본 발화 라벨이 남습니다.");
}
if (
  singleSpeakerMeeting.timeline.segments.some((segment) =>
    segment.speakers?.includes("발화"),
  )
) {
  throw new Error("한 명 화자 회의의 타임라인에 기본 발화 라벨이 남습니다.");
}
if (singleSpeakerMeeting.timeline.actions?.[0]?.owner !== "화자 A") {
  throw new Error("한 명 화자 회의의 액션 담당자에 기본 발화 라벨이 남습니다.");
}

const legacySingleSpeakerPresentation = normalizeSingleSpeakerMeetingPresentation({
  semantic: singleSpeakerWithGenericFallback,
  meeting: {
    ...singleSpeakerMeeting.meeting,
    participants: [
      ...singleSpeakerMeeting.meeting.participants,
      {
        id: "spk-voice",
        name: "발화",
        initials: "발",
        color: "bg-slate-500",
        recognition: "voice",
        recognitionNote: "화자 분리 없음",
      },
    ],
  },
  transcript: {
    ...singleSpeakerMeeting.transcript,
    lines: singleSpeakerMeeting.transcript.lines.map((line, index) =>
      index === 1 ? { ...line, speaker: "발화" } : line,
    ),
  },
  timeline: {
    ...singleSpeakerMeeting.timeline,
    actions: [{ owner: "발화", task: "자료를 공유한다" }],
    segments: singleSpeakerMeeting.timeline.segments.map((segment) => ({
      ...segment,
      speakers: ["화자 A", "발화"],
      speakerNotes: [{ name: "발화", said: "계속 설명" }],
    })),
  },
});
if (
  legacySingleSpeakerPresentation.meeting.participants.length !== 1 ||
  legacySingleSpeakerPresentation.transcript.lines.some(
    (line) => line.speaker === "발화",
  ) ||
  legacySingleSpeakerPresentation.timeline.segments.some((segment) =>
    segment.speakers?.includes("발화"),
  ) ||
  legacySingleSpeakerPresentation.timeline.actions?.[0]?.owner === "발화"
) {
  throw new Error("기존 한 명 화자 회의의 기본 발화 라벨을 표시 단계에서 보정하지 못합니다.");
}

const legacyWithoutSemantic = normalizeSingleSpeakerMeetingPresentation({
  meeting: legacySingleSpeakerPresentation.meeting,
  transcript: {
    ...legacySingleSpeakerPresentation.transcript,
    lines: legacySingleSpeakerPresentation.transcript.lines.map((line, index) =>
      index === 1 ? { ...line, speaker: "발화" } : line,
    ),
  },
  timeline: {
    ...legacySingleSpeakerPresentation.timeline,
    segments: legacySingleSpeakerPresentation.timeline.segments.map((segment) => ({
      ...segment,
      speakers: ["화자 A", "발화"],
    })),
  },
});
if (
  legacyWithoutSemantic.transcript.lines.some((line) => line.speaker === "발화") ||
  legacyWithoutSemantic.timeline.segments.some((segment) =>
    segment.speakers?.includes("발화"),
  )
) {
  throw new Error("semantic이 없는 기존 회의의 기본 발화 라벨을 보정하지 못합니다.");
}

const multiSpeakerWithGenericFallback = {
  ...singleSpeakerWithGenericFallback,
  speakers: [
    { name: "화자 A", summary: "첫 번째 발표", tags: [] },
    { name: "화자 B", summary: "두 번째 발표", tags: [] },
    { name: "발화", summary: "라벨 없음", tags: [] },
  ],
  dialogue: [
    { startSec: 0, speaker: "화자 A", text: "첫 번째 화자입니다." },
    { startSec: 4, speaker: "화자 B", text: "두 번째 화자입니다." },
    { startSec: 8, speaker: "발화", text: "라벨 없는 구간입니다." },
  ],
} satisfies SemanticStructure;
const multiSpeakerParticipants = buildParticipantsFromSemantic(
  multiSpeakerWithGenericFallback,
);
if (
  multiSpeakerParticipants.map((participant) => participant.name).join("|") !==
  "화자 A|화자 B|발화"
) {
  throw new Error("둘 이상의 실제 화자가 있는 경우 기본 발화 라벨을 억지로 합쳤습니다.");
}

const merged = mergeReconciledTranscriptParts([
  "대시보드는 현황 정보를 제공합니다.",
  "제공합니다. 현재 38개의 과제가 등록되어 있습니다.",
]);
if (merged.join(" ").match(/제공합니다/g)?.length !== 1) {
  throw new Error("검수 단계가 청크 경계 중복을 다시 만들었습니다.");
}

// 앞 단어의 잔상과 다음 단어의 실제 발화가 겹칠 때는 실제 발화가 우선이다.
// brief-ailab의 "직접 작동"에서 한 단어 늦게 보이던 회귀를 고정한다.
const overlappingFocus = activeWordFocusAt(
  [
    { text: "직접", startSec: 32.457, endSec: 32.897 },
    { text: "작동하는", startSec: 32.897, endSec: 33.417 },
  ],
  33.0,
);
if (overlappingFocus?.word.text !== "작동하는" || overlappingFocus.strength !== 1) {
  throw new Error("이전 단어의 잔상이 현재 발화 단어를 가립니다.");
}

const repairedTurns = repairShortTurnProtocols([
  { startSec: 0, endSec: 10, speaker: "화자 A", text: "오늘 정책을 길게 설명하고 질문을 받겠습니다." },
  { startSec: 10, endSec: 12, speaker: "화자 D", text: "오랫동안 고생 많으셨습니다." },
  { startSec: 12, endSec: 13, speaker: "화자 E", text: "네, 감사합니다." },
  { startSec: 14, endSec: 20, speaker: "화자 C", text: "이어서 정책의 기준을 여쭙고 싶습니다." },
  { startSec: 21, endSec: 22, speaker: "화자 D", text: "네." },
  { startSec: 22, endSec: 25, speaker: "화자 F", text: "네, 수석님 뉴시스 김영록 기자입니다." },
  { startSec: 26, endSec: 27, speaker: "화자 D", text: "네." },
  { startSec: 27, endSec: 30, speaker: "화자 G", text: "수석님 안녕하십니까. 손지은 기자입니다." },
]);
const repairedSpeakers = repairedTurns.map((turn) => turn.speaker);
if (
  repairedSpeakers[1] !== "화자 C" ||
  repairedSpeakers[2] !== "화자 A" ||
  repairedSpeakers[4] !== "화자 A" ||
  repairedSpeakers[6] !== "화자 G"
) {
  throw new Error("짧은 맞장구의 진행자/질문자 경계 보정이 회귀했습니다.");
}

console.log(
  JSON.stringify({
    ok: true,
    evidenceLines: dialogue.length,
    speakerLines: speakerDialogue.length,
    groundedParticipants: participants.map((participant) => participant.name),
    singleSpeakerFallback: singleSpeakerMeeting.meeting.participants.map(
      (participant) => participant.name,
    ),
    legacySingleSpeakerFallback:
      legacySingleSpeakerPresentation.meeting.participants.map(
        (participant) => participant.name,
      ),
    preservedMultiSpeakerFallback: multiSpeakerParticipants.map(
      (participant) => participant.name,
    ),
    reconciledParts: merged.length,
  }),
);
