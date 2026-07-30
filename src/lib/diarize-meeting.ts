import type { Meeting, Participant } from "@/types/meeting";
import type { MeetingTimeline, TimelineSegment, TimelineSegmentKind } from "@/types/timeline";
import type { MeetingTranscript, TranscriptLine } from "@/types/transcript";

/** AI diarize 한 구간. speaker는 모델 라벨(A/B/…) 그대로. */
export type DiarizeSegment = {
  speaker: string;
  text: string;
  /** 초. 실측(또는 정렬) 시각. 추정 금지 경로에서는 필수. */
  startSec?: number;
  endSec?: number;
};

export type DiarizeMeetingInput = {
  meetingId: string;
  title: string;
  tags?: string[];
  summaryTags?: string[];
  daysAgo?: number;
  time?: string;
  /** 전체 길이(초) */
  durationSec: number;
  workspace?: Meeting["workspace"];
  security?: Meeting["security"];
  /** 모델이 준 구간. 화자 매핑하지 않음 */
  segments: DiarizeSegment[];
  overallSummary?: string;
  /** `.data/stt-bench` 상대 파일명 또는 `/samples/...` */
  replayAudio?: string;
  /**
   * true면 start/end 없는 구간을 글자 수로 추정(싱크 깨짐).
   * 상품·시드는 false(기본).
   */
  allowEstimateTimes?: boolean;
  /** 화자별 한 줄 요약·태그. name은 표시명(화자 A) */
  speakerContributions?: Array<{
    name: string;
    summary?: string;
    tags?: string[];
  }>;
};

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

/** AI 라벨 → UI 표시명. 이름 추론 없이 라벨만 유지. */
export function aiSpeakerLabel(raw: string): string {
  const id = raw.trim().replace(/^speaker\s*/i, "");
  if (!id) return "화자";
  if (id.startsWith("화자")) return id;
  return `화자 ${id}`;
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatDurationLabel(durationSec: number): string {
  const s = Math.max(0, Math.round(durationSec));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? `${h}시간 ${rm}분` : `${h}시간`;
  }
  if (sec === 0) return `${m}분`;
  return `${m}분 ${sec}초`;
}

/** `[A] text` 또는 `[A][12.3-15.1] text` 줄 파싱. */
export function parseDiarizedText(raw: string): DiarizeSegment[] {
  const out: DiarizeSegment[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const timed = trimmed.match(
      /^\[([^\]]+)\]\[(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\]\s*(.*)$/,
    );
    if (timed) {
      const text = (timed[4] || "").trim();
      if (!text) continue;
      const startSec = Number(timed[2]);
      const endSec = Number(timed[3]);
      out.push({
        speaker: timed[1]!.trim(),
        text,
        startSec: Number.isFinite(startSec) ? startSec : undefined,
        endSec: Number.isFinite(endSec) ? endSec : undefined,
      });
      continue;
    }
    const m = trimmed.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (m) {
      const text = (m[2] || "").trim();
      if (!text) continue;
      out.push({ speaker: m[1]!.trim(), text });
      continue;
    }
    out.push({ speaker: "A", text: trimmed });
  }
  return out;
}

/** OpenAI diarized_json segments → DiarizeSegment (start/end 유지). */
export function parseDiarizedApiSegments(
  segments: Array<{
    speaker?: string;
    text?: string;
    start?: number;
    end?: number;
  }>,
): DiarizeSegment[] {
  const out: DiarizeSegment[] = [];
  for (const s of segments) {
    const text = (s.text || "").trim();
    if (!text) continue;
    const startSec = Number(s.start);
    const endSec = Number(s.end);
    out.push({
      speaker: (s.speaker || "A").trim() || "A",
      text,
      startSec: Number.isFinite(startSec) ? Math.max(0, startSec) : undefined,
      endSec:
        Number.isFinite(endSec) && Number.isFinite(startSec)
          ? Math.max(startSec, endSec)
          : undefined,
    });
  }
  return out;
}

/** 실측 시각 포함 diarized 텍스트 한 줄. */
export function formatDiarizedTimedLine(seg: DiarizeSegment): string {
  const sp = seg.speaker.trim() || "A";
  if (
    typeof seg.startSec === "number" &&
    Number.isFinite(seg.startSec) &&
    typeof seg.endSec === "number" &&
    Number.isFinite(seg.endSec)
  ) {
    return `[${sp}][${seg.startSec.toFixed(3)}-${seg.endSec.toFixed(3)}] ${seg.text}`;
  }
  return `[${sp}] ${seg.text}`;
}

function resolveSegmentTimes(
  segments: DiarizeSegment[],
  durationSec: number,
  allowEstimateTimes: boolean,
): Array<DiarizeSegment & { startSec: number; endSec: number }> {
  const hasAll = segments.every(
    (s) => typeof s.startSec === "number" && typeof s.endSec === "number",
  );
  if (hasAll) {
    return segments.map((s) => ({
      ...s,
      startSec: s.startSec as number,
      endSec: s.endSec as number,
    }));
  }

  if (!allowEstimateTimes) {
    throw new Error(
      "화자분리 구간에 실측 start/end가 없습니다. diarized_json·timed-segments로 시각을 넣은 뒤 다시 시도하세요.",
    );
  }

  const weights = segments.map((s) => Math.max(1, s.text.length));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return segments.map((s, i) => {
    const span = (weights[i]! / total) * durationSec;
    const startSec = cursor;
    const endSec = i === segments.length - 1 ? durationSec : cursor + span;
    cursor = endSec;
    return { ...s, startSec, endSec };
  });
}

function buildParticipants(
  labels: string[],
  contributions?: Map<string, { summary?: string; tags?: string[] }>,
): Participant[] {
  return labels.map((label, i) => {
    const display = aiSpeakerLabel(label);
    const token = label.replace(/^화자\s*/i, "").trim() || String.fromCharCode(65 + i);
    const c = contributions?.get(display) ?? contributions?.get(label);
    return {
      id: `spk-${token}`,
      name: display,
      initials: token.slice(0, 1).toUpperCase(),
      color: SPEAKER_COLORS[i % SPEAKER_COLORS.length],
      isMember: false,
      recognition: "voice" as const,
      recognitionNote: "AI 화자 분리 라벨",
      summary: c?.summary,
      tags: c?.tags,
    };
  });
}

function inferKind(text: string, index: number, total: number): TimelineSegmentKind {
  if (/의결|가결|선포|결정|합의/.test(text)) return "decision";
  if (/후속|조치|담당|마감|액션/.test(text)) return "action";
  if (/리스크|위험|우려/.test(text)) return "risk";
  if (index === 0) return "agenda";
  if (index === total - 1) return "discussion";
  return "discussion";
}

function buildTimelineSegments(
  timed: Array<DiarizeSegment & { startSec: number; endSec: number }>,
  durationSec: number,
): {
  segments: TimelineSegment[];
  /** timed index → segment id */
  lineSegmentIds: string[];
} {
  if (timed.length === 0) return { segments: [], lineSegmentIds: [] };

  const bucketCount = Math.min(5, Math.max(2, Math.ceil(timed.length / 25)));
  const bucketSec = durationSec / bucketCount;
  const buckets: Array<{
    items: Array<{ seg: (typeof timed)[number]; index: number }>;
    speakers: Set<string>;
  }> = Array.from({ length: bucketCount }, () => ({
    items: [],
    speakers: new Set<string>(),
  }));

  const lineSegmentIds = timed.map(() => "s1");

  for (let i = 0; i < timed.length; i++) {
    const seg = timed[i];
    const idx = Math.min(
      bucketCount - 1,
      Math.floor(seg.startSec / bucketSec),
    );
    buckets[idx].items.push({ seg, index: i });
    buckets[idx].speakers.add(aiSpeakerLabel(seg.speaker));
    lineSegmentIds[i] = `s${idx + 1}`;
  }

  const segments: TimelineSegment[] = buckets.flatMap((b, i) => {
    if (b.items.length === 0) return [];
    const start = b.items[0].seg.startSec;
    const end = b.items[b.items.length - 1].seg.endSec;
    const joined = b.items.map((x) => x.seg.text).join(" ");
    const summary =
      joined.length > 120 ? `${joined.slice(0, 117)}…` : joined;
    return [
      {
        id: `s${i + 1}`,
        start: formatClock(start),
        end: formatClock(end),
        title: i === 0 ? "시작" : `구간 ${i + 1}`,
        summary,
        kind: inferKind(joined, i, bucketCount),
        speakers: [...b.speakers],
      } satisfies TimelineSegment,
    ];
  });

  return { segments, lineSegmentIds };
}

/**
 * AI diarize 결과를 회의 UI 데이터로 변환.
 * 화자 이름 추론 없음. 모델 라벨만 표시.
 * 기본은 실측 시각 필수(글자 수 추정으로 싱크를 깨지 않음).
 */
export function buildMeetingFromDiarize(input: DiarizeMeetingInput): {
  meeting: Omit<Meeting, "date"> & { daysAgo: number; time: string };
  transcript: MeetingTranscript;
  timeline: MeetingTimeline;
} {
  const timed = resolveSegmentTimes(
    input.segments,
    input.durationSec,
    input.allowEstimateTimes === true,
  );
  const order: string[] = [];
  const seen = new Set<string>();
  for (const s of timed) {
    const key = s.speaker.trim();
    if (!seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }

  const contribMap = new Map<string, { summary?: string; tags?: string[] }>();
  for (const c of input.speakerContributions ?? []) {
    const key = aiSpeakerLabel(c.name);
    contribMap.set(key, { summary: c.summary, tags: c.tags });
  }
  const participants = buildParticipants(order, contribMap);
  const { segments: timelineSegments, lineSegmentIds } = buildTimelineSegments(
    timed,
    input.durationSec,
  );

  const lines: TranscriptLine[] = timed.map((s, i) => ({
    id: `l${i + 1}`,
    time: formatClock(s.startSec),
    speaker: aiSpeakerLabel(s.speaker),
    text: s.text,
    segmentId: lineSegmentIds[i],
  }));

  const durationLabel = formatDurationLabel(input.durationSec);
  const firstText = timed[0]?.text ?? "";

  return {
    meeting: {
      id: input.meetingId,
      title: input.title,
      tags: input.tags ?? ["받아쓰기", "화자분리"],
      summaryTags: input.summaryTags ?? ["AI", "화자"],
      daysAgo: input.daysAgo ?? 0,
      time: input.time ?? "12:00:00",
      duration: durationLabel,
      participants,
      status: "completed",
      security: input.security ?? "protected",
      workspace: input.workspace ?? "personal",
      capture: "upload",
      replayAudio: input.replayAudio,
    },
    transcript: {
      meetingId: input.meetingId,
      lines,
    },
    timeline: {
      meetingId: input.meetingId,
      durationLabel,
      overallSummary:
        input.overallSummary ??
        (firstText
          ? `AI 화자 분리 기록. ${firstText.slice(0, 80)}${firstText.length > 80 ? "…" : ""}`
          : "AI 화자 분리 기록."),
      segments: timelineSegments,
    },
  };
}
