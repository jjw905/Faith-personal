import type { MeetingTimeline } from "@/types/timeline";
import type { SemanticStructure } from "@/lib/stt/semantic-structure";

/** 예전 overallSummary에 붙은 '결정:/액션:' 블록을 구역으로 분리. */
export function parseLegacySummaryBlocks(raw: string): {
  overview: string;
  decisions: string[];
  actions: Array<{ owner: string; task: string }>;
} {
  const text = raw.trim();
  if (!text) return { overview: "", decisions: [], actions: [] };

  const decisionMatch = text.match(/\n결정:\s*([\s\S]*?)(?=\n액션:|$)/);
  const actionMatch = text.match(/\n액션:\s*([\s\S]*)$/);
  const overview = text
    .replace(/\n결정:[\s\S]*$/, "")
    .replace(/\n액션:[\s\S]*$/, "")
    .trim();

  const decisions = (decisionMatch?.[1] || "")
    .trim()
    .split(/,\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const actions = (actionMatch?.[1] || "")
    .trim()
    .split(/,\s+/)
    .map((s) => {
      const m = s.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
      if (m) return { owner: m[1].trim(), task: m[2].trim() };
      return { owner: "", task: s.trim() };
    })
    .filter((a) => a.task);

  return {
    overview: overview || text,
    decisions,
    actions,
  };
}

/** 타임라인에 결정·액션 구역을 채운다. semantic 우선, 없으면 legacy 문자열 파싱. */
export function withStructuredTimeline(
  timeline: MeetingTimeline,
  semantic?: SemanticStructure | null,
): MeetingTimeline {
  if (
    (timeline.decisions?.length ?? 0) > 0 ||
    (timeline.actions?.length ?? 0) > 0
  ) {
    return {
      ...timeline,
      overallSummary: stripLegacyLabels(timeline.overallSummary),
    };
  }

  if (semantic) {
    return {
      ...timeline,
      overallSummary: semantic.overallSummary.trim() || timeline.overallSummary,
      decisions: semantic.decisions.filter(Boolean),
      actions: semantic.actions
        .filter((a) => a.task.trim())
        .map((a) => ({
          owner: a.owner,
          task: a.task,
          due: a.due || undefined,
        })),
    };
  }

  const parsed = parseLegacySummaryBlocks(timeline.overallSummary);
  if (parsed.decisions.length === 0 && parsed.actions.length === 0) {
    return timeline;
  }

  return {
    ...timeline,
    overallSummary: parsed.overview,
    decisions: parsed.decisions,
    actions: parsed.actions,
  };
}

function stripLegacyLabels(raw: string): string {
  return raw
    .replace(/\n결정:[\s\S]*$/, "")
    .replace(/\n액션:[\s\S]*$/, "")
    .trim();
}
