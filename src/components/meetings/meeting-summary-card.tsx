import type { MeetingTimeline } from "@/types/timeline";
import { cn } from "@/lib/utils";

type SummarySection = {
  title: string;
  body?: string;
  items?: string[];
};

function buildSections(timeline: MeetingTimeline): SummarySection[] {
  const sections: SummarySection[] = [];
  const overview = timeline.overallSummary.trim();
  if (overview) {
    sections.push({ title: "개요", body: overview });
  }

  const decisions = (timeline.decisions ?? []).map((d) => d.trim()).filter(Boolean);
  if (decisions.length > 0) {
    sections.push({ title: "결정", items: decisions });
  }

  const actions = (timeline.actions ?? [])
    .map((a) => {
      const task = a.task.trim();
      if (!task) return "";
      const owner = a.owner.trim();
      const due = a.due?.trim();
      if (owner && due) return `${owner}: ${task} (${due})`;
      if (owner) return `${owner}: ${task}`;
      return task;
    })
    .filter(Boolean);
  if (actions.length > 0) {
    sections.push({ title: "후속", items: actions });
  }

  return sections;
}

/** Changelog처럼 개요 / 결정 / 후속을 구역으로 나눈 회의 요약. */
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
    <section
      className={cn("rounded-2xl bg-surface px-4 py-4 sm:px-5", className)}
      aria-label="회의 요약"
    >
      <p className="text-xs font-semibold tracking-wide text-muted-2">
        요약
      </p>

      <div className="mt-4 space-y-5">
        {sections.map((section) => (
          <div key={section.title} className="max-w-2xl">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              {section.title}
            </h3>
            {section.body ? (
              <p className="mt-1.5 text-sm leading-[1.65] text-muted">
                {section.body}
              </p>
            ) : null}
            {section.items?.length ? (
              <ul className="mt-2 list-none space-y-1.5 border-l border-border pl-3.5">
                {section.items.map((item) => (
                  <li
                    key={item}
                    className="text-sm leading-[1.65] text-muted"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
