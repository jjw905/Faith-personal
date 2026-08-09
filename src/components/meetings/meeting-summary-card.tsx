"use client";

import {
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
} from "react";

import type { MeetingTimeline } from "@/types/timeline";
import { MEETING_SECTION_RULE_ROW } from "@/lib/meeting-section-header";
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

function formatActionLine(action: {
  owner: string;
  task: string;
  due?: string;
}): string {
  const owner = action.owner.trim();
  const task = action.task.trim();
  const due = action.due?.trim();
  if (!task) return "";
  const head = owner ? `${owner}: ${task}` : task;
  return due ? `${head} · ${due}` : head;
}

function parseActionLine(line: string): {
  owner: string;
  task: string;
  due?: string;
} | null {
  const raw = line.trim();
  if (!raw) return null;
  let rest = raw;
  let due: string | undefined;
  const dueSep = rest.lastIndexOf(" · ");
  if (dueSep >= 0) {
    due = rest.slice(dueSep + 3).trim() || undefined;
    rest = rest.slice(0, dueSep).trim();
  }
  const colon = rest.indexOf(":");
  if (colon > 0) {
    return {
      owner: rest.slice(0, colon).trim(),
      task: rest.slice(colon + 1).trim(),
      ...(due ? { due } : {}),
    };
  }
  return { owner: "", task: rest, ...(due ? { due } : {}) };
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

/** 보기 문단과 같은 타이포 — 테두리·박스 없이 글자만 수정 */
const inplaceBodyClass =
  "mt-1.5 w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-base leading-[1.65] text-muted outline-none ring-0 focus-visible:outline-none disabled:opacity-60";

function InplaceBodyTextarea({
  value,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      rows={1}
      className={cn(inplaceBodyClass, className)}
    />
  );
}

function parseDecisionsText(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (raw.includes("\n")) {
    return raw
      .split("\n")
      .map((d) => d.trim())
      .filter(Boolean);
  }
  return [trimmed];
}

/** 개요 / 결정 / 후속을 전체 문단으로 보여주는 회의 요약. */
export function MeetingSummaryCard({
  timeline,
  className,
  editMode = false,
  disabled = false,
  onChange,
}: {
  timeline: MeetingTimeline;
  className?: string;
  editMode?: boolean;
  disabled?: boolean;
  onChange?: (next: MeetingTimeline) => void;
}) {
  const editing = Boolean(editMode && onChange);

  if (!editing) {
    const sections = buildSections(timeline);
    if (sections.length === 0) return null;

    return (
      <section className={cn(className)} aria-label="회의 요약">
        <div className={MEETING_SECTION_RULE_ROW}>
          <p className="shrink-0 text-sm font-semibold tracking-wide text-muted-2">
            요약
          </p>
        </div>

        <div className="mt-5 space-y-5">
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

  // 보기와 같은 문단을 그대로 편집 — 폼 박스로 바꾸지 않음
  const decisionsEditText = (() => {
    const list = (timeline.decisions ?? []).map((d) => d.trim()).filter(Boolean);
    if (list.length === 0) return "";
    if (list.length === 1) return list[0];
    return joinAsParagraph(list);
  })();
  const actionsEditText = (() => {
    const actions = timeline.actions ?? [];
    if (actions.length === 0) return "";
    // 편집 중 단일 문단으로 합쳐진 경우 ensureSentence 재적용으로 커서가 튀지 않게
    if (
      actions.length === 1 &&
      !actions[0].owner?.trim() &&
      !actions[0].due?.trim()
    ) {
      return actions[0].task;
    }
    return (
      joinAsParagraph(actions.map(formatActionClause).filter(Boolean)) ||
      actions.map(formatActionLine).filter(Boolean).join("\n")
    );
  })();

  return (
    <section className={cn(className)} aria-label="회의 요약">
      <div className={MEETING_SECTION_RULE_ROW}>
        <p className="shrink-0 text-sm font-semibold tracking-wide text-muted-2">
          요약
        </p>
      </div>

      <div className="mt-5 space-y-5">
        <div className="max-w-3xl">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            개요
          </h3>
          <InplaceBodyTextarea
            value={timeline.overallSummary}
            disabled={disabled}
            aria-label="개요"
            onChange={(e) =>
              onChange!({ ...timeline, overallSummary: e.target.value })
            }
          />
        </div>
        <div className="max-w-3xl">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            결정
          </h3>
          <InplaceBodyTextarea
            value={decisionsEditText}
            disabled={disabled}
            aria-label="결정"
            onChange={(e) =>
              onChange!({
                ...timeline,
                decisions: parseDecisionsText(e.target.value),
              })
            }
          />
        </div>
        <div className="max-w-3xl">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">
            후속
          </h3>
          <InplaceBodyTextarea
            value={actionsEditText}
            disabled={disabled}
            aria-label="후속"
            onChange={(e) => {
              const raw = e.target.value;
              const nextActions = raw.includes("\n")
                ? raw
                    .split("\n")
                    .map(parseActionLine)
                    .filter((a): a is NonNullable<typeof a> => Boolean(a?.task))
                : raw.trim()
                  ? [{ owner: "", task: raw.trim() }]
                  : [];
              onChange!({
                ...timeline,
                actions: nextActions,
              });
            }}
          />
        </div>
      </div>
    </section>
  );
}
