import type { MeetingTimeline } from "@/types/timeline";
import { cn } from "@/lib/utils";

type SummarySection = {
  title: string;
  body: string;
};

function ensureSentence(text: string): string {
  const t = text.trim().replace(/[.。]+$/u, "").trim();
  if (!t) return "";
  if (/[.!?…]$/u.test(t)) return t;
  // 한국어 서술 종결이 아니면 마침표만 붙인다.
  return `${t}.`;
}

/** 항목을 사람별 나열이 아닌 이어진 문단으로 합친다. */
function joinAsParagraph(parts: string[]): string {
  const cleaned = parts.map((p) => p.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return ensureSentence(cleaned[0]);

  const clauses = cleaned.map((p) => p.replace(/[.。]+$/u, "").trim());
  const head = clauses.slice(0, -1).join(", ");
  const last = clauses[clauses.length - 1];
  return ensureSentence(`${head}, ${last}`);
}

function formatActionClause(action: {
  owner: string;
  task: string;
  due?: string;
}): string {
  const task = action.task.trim();
  if (!task) return "";
  const due = action.due?.trim();
  // 담당자 콜론 나열 대신 과제·기한 중심 문장.
  if (due) return `${task}는 ${due}까지`;
  return task;
}

function buildSections(timeline: MeetingTimeline): SummarySection[] {
  const sections: SummarySection[] = [];
  const overview = timeline.overallSummary.trim();
  if (overview) {
    sections.push({ title: "개요", body: overview });
  }

  const decisions = (timeline.decisions ?? [])
    .map((d) => d.trim())
    .filter(Boolean);
  const decisionsBody = joinAsParagraph(decisions);
  if (decisionsBody) {
    sections.push({ title: "결정", body: decisionsBody });
  }

  const actionClauses = (timeline.actions ?? [])
    .map(formatActionClause)
    .filter(Boolean);
  const actionsBody = joinAsParagraph(actionClauses);
  if (actionsBody) {
    sections.push({ title: "후속", body: actionsBody });
  }

  return sections;
}

/** 개요 / 결정 / 후속을 전체 문단으로 보여주는 회의 요약. */
export function MeetingSummaryCard({
  timeline,
  className,
}: {
  timeline: MeetingTimeline;
  className?: string;
}) {
  const sections = buildSections(timeline);
  if (sections.length === 0) return null;

  return (
    <section className={cn(className)} aria-label="회의 요약">
      <p className="text-base font-semibold tracking-wide text-muted-2">요약</p>

      <div className="mt-4 space-y-5">
        {sections.map((section) => (
          <div key={section.title} className="max-w-3xl">
            <h3 className="text-lg font-semibold tracking-tight text-foreground">
              {section.title}
            </h3>
            <p className="mt-1.5 whitespace-pre-line text-base leading-[1.65] text-muted">
              {section.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
