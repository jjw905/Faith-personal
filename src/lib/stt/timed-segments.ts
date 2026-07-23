import type { SemanticDialogueLine } from "@/lib/stt/semantic-structure";
import type { TimelineSegment, TimelineSegmentKind } from "@/types/timeline";
import { formatClock } from "@/lib/diarize-meeting";

export type TimedSegment = {
  startSec: number;
  endSec: number;
  text: string;
};

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2),
  );
}

function textHasToken(text: string, token: string): boolean {
  const t = text.toLowerCase();
  const tok = token.toLowerCase();
  if (t.includes(tok)) return true;
  return tokenize(text).has(tok);
}

function overlapScore(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  if (A.size === 0 || B.size === 0) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit += 1;
  return hit / Math.sqrt(A.size * B.size);
}

/**
 * 구조화 dialogue의 startSec를 STT 실측 세그먼트에 맞춤.
 * 순서는 유지하고, 매칭 실패 시 직전 시각·문자비율로 보정.
 */
export function alignDialogueToTimedSegments(
  dialogue: SemanticDialogueLine[],
  timed: TimedSegment[],
  durationSec: number,
): SemanticDialogueLine[] {
  if (dialogue.length === 0) return [];
  const dur = Math.max(1, durationSec);

  if (timed.length === 0) {
    const totalChars = dialogue.reduce((s, d) => s + d.text.length, 0) || 1;
    let acc = 0;
    let prev = 0;
    return dialogue.map((d) => {
      const startSec = Math.min(dur, (acc / totalChars) * dur);
      acc += d.text.length;
      const next = Math.max(prev, startSec);
      prev = next;
      return { ...d, startSec: next };
    });
  }

  let cursor = 0;
  let prevSec = 0;
  return dialogue.map((d) => {
    let bestIdx = -1;
    let best = -1;
    const from = Math.max(0, cursor - 2);
    for (let i = from; i < timed.length; i++) {
      const sc = overlapScore(d.text, timed[i]!.text);
      // 가까운 세그먼트 가산
      const near = 1 / (1 + Math.abs(i - cursor) * 0.15);
      const score = sc * near;
      if (score > best) {
        best = score;
        bestIdx = i;
      }
    }
    let startSec: number;
    if (bestIdx >= 0 && best >= 0.08) {
      startSec = timed[bestIdx]!.startSec;
      cursor = bestIdx;
    } else {
      // 약한 매칭: 진행 커서 근처 세그먼트
      const approx = timed[Math.min(cursor, timed.length - 1)]!;
      startSec = approx.startSec;
    }
    startSec = Math.max(prevSec, Math.min(dur, startSec));
    prevSec = startSec;
    return { ...d, startSec };
  });
}

export type TimelineMapItem = {
  title: string;
  summary?: string;
  speakers?: string[];
  kind?: string;
};

function parseTimelineKind(raw: string | undefined): TimelineSegmentKind {
  const k = (raw || "").trim().toLowerCase();
  if (k === "agenda") return "agenda";
  if (k === "discussion") return "discussion";
  if (k === "decision") return "decision";
  if (k === "action") return "action";
  if (k === "risk") return "risk";
  if (k === "report") return "report";
  if (k === "vote") return "vote";
  return "discussion";
}

/**
 * dialogue 실측 startSec로 타임라인 구간 경계 매핑 (연속 최적 할당).
 */
export function mapTimelineByDialogue(params: {
  items: TimelineMapItem[];
  dialogue: SemanticDialogueLine[];
  durationSec: number;
}): TimelineSegment[] {
  const { items, dialogue, durationSec } = params;
  const n = items.length;
  const m = dialogue.length;
  const dur = Math.max(1, durationSec);

  if (n === 0) return [];

  if (m === 0) {
    const span = dur / n;
    return items.map((item, i) => ({
      id: `s${i + 1}`,
      start: formatClock(i * span),
      end: formatClock(i === n - 1 ? dur : (i + 1) * span),
      title: item.title || `구간 ${i + 1}`,
      summary: item.summary || item.title || "",
      kind: parseTimelineKind(item.kind),
      speakers:
        item.speakers && item.speakers.length > 0
          ? item.speakers
          : (["발화"] as string[]),
    }));
  }

  const score = Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, j) => {
      const q = `${items[i]!.title} ${items[i]!.summary || ""}`;
      return overlapScore(q, dialogue[j]!.text);
    }),
  );

  const NEG = -1e18;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(NEG),
  );
  const cut: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0),
  );
  dp[0]![0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = i; j <= m; j++) {
      for (let k = i - 1; k < j; k++) {
        if (dp[i - 1]![k]! <= NEG / 2) continue;
        let seg = 0;
        for (let t = k; t < j; t++) seg += score[i - 1]![t]!;
        seg = seg / Math.max(1, j - k) + seg * 0.15;
        const val = dp[i - 1]![k]! + seg;
        if (val > dp[i]![j]!) {
          dp[i]![j] = val;
          cut[i]![j] = k;
        }
      }
    }
  }

  const starts: number[] = Array(n).fill(0);
  let j = m;
  for (let i = n; i >= 1; i--) {
    const k = cut[i]![j]!;
    starts[i - 1] = k;
    j = k;
  }

  return items.map((item, i) => {
    const a = starts[i]!;
    const b = i + 1 < n ? starts[i + 1]! : m;
    const startSec = Math.max(
      0,
      Math.min(dur, dialogue[a]?.startSec ?? 0),
    );
    const endSec =
      i === n - 1
        ? dur
        : Math.max(
            startSec,
            Math.min(dur, dialogue[b]?.startSec ?? dur),
          );

    const fromDialogue = [
      ...new Set(
        dialogue
          .slice(a, b)
          .map((d) => d.speaker)
          .filter(Boolean) as string[],
      ),
    ];
    const speakers = [
      ...new Set([...(item.speakers ?? []), ...fromDialogue]),
    ].filter(Boolean);

    return {
      id: `s${i + 1}`,
      start: formatClock(startSec),
      end: formatClock(endSec),
      title: item.title || `구간 ${i + 1}`,
      summary: item.summary || item.title || "",
      kind: parseTimelineKind(item.kind),
      speakers: speakers.length > 0 ? speakers : (["발화"] as string[]),
    } satisfies TimelineSegment;
  });
}

/**
 * STT 실측 세그먼트로 타임라인 구간 경계 매핑.
 * 구간 제목의 고유 토큰으로 순차 앵커를 잡은 뒤 경계를 확정한다.
 */
export function mapTimelineByTimedSegments(params: {
  items: TimelineMapItem[];
  timed: TimedSegment[];
  durationSec: number;
}): TimelineSegment[] {
  const { items, timed, durationSec } = params;
  const n = items.length;
  const m = timed.length;
  const dur = Math.max(1, durationSec);

  if (n === 0) return [];

  if (m === 0) {
    return mapTimelineByDialogue({
      items,
      dialogue: [],
      durationSec: dur,
    });
  }

  const titleToks = items.map((it) => tokenize(it.title));
  const exclusive = titleToks.map((toks, i) => {
    const others = new Set<string>();
    titleToks.forEach((t, j) => {
      if (j === i) return;
      for (const x of t) others.add(x);
    });
    const uniq = [...toks].filter((t) => !others.has(t));
    return uniq.length > 0 ? new Set(uniq) : toks;
  });

  const anchors: number[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const remain = n - i;
    const latestStart = Math.max(cursor, m - remain);
    let bestJ = cursor;
    let bestScore = -1;
    let firstGood = -1;

    for (let j = cursor; j <= latestStart; j++) {
      const text = timed[j]!.text;
      let hit = 0;
      for (const t of exclusive[i]!) if (textHasToken(text, t)) hit += 1;
      const exclusivity =
        exclusive[i]!.size > 0 ? hit / exclusive[i]!.size : 0;
      const soft = overlapScore(items[i]!.title, text);
      const score = exclusivity * 3 + soft * 0.5 - j * 0.001;
      if (score > bestScore) {
        bestScore = score;
        bestJ = j;
      }
      // 제목 고유어가 하나라도 나오면 첫 구간으로 확정
      if (firstGood < 0 && hit >= 1) {
        firstGood = j;
      }
    }

    const chosen = firstGood >= 0 ? firstGood : bestJ;
    anchors.push(chosen);
    cursor = Math.min(m - 1, chosen + 1);
  }

  // 비감소 강제
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i]! <= anchors[i - 1]!) {
      anchors[i] = Math.min(m - 1, anchors[i - 1]! + 1);
    }
  }

  // 첫 구간은 항상 녹음 시작(0초)부터.
  return items.map((item, i) => {
    const a = anchors[i]!;
    const b = i + 1 < n ? anchors[i + 1]! : m;
    const startSec =
      i === 0 ? 0 : Math.max(0, Math.min(dur, timed[a]?.startSec ?? 0));
    const endSec =
      i === n - 1
        ? dur
        : Math.max(startSec, Math.min(dur, timed[b]?.startSec ?? dur));

    return {
      id: `s${i + 1}`,
      start: formatClock(startSec),
      end: formatClock(endSec),
      title: item.title || `구간 ${i + 1}`,
      summary: item.summary || item.title || "",
      kind: parseTimelineKind(item.kind),
      speakers:
        item.speakers && item.speakers.length > 0
          ? item.speakers
          : (["발화"] as string[]),
    } satisfies TimelineSegment;
  });
}


