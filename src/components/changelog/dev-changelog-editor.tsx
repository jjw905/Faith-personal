"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { ChangelogList } from "@/components/changelog/changelog-list";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { getChangelogDateLabel } from "@/lib/changelog";
import type { DevChangelogState } from "@/lib/changelog-store";
import {
  fixtureDevChangelogEmpty,
  fixtureDevChangelogFull,
} from "@/lib/page-ux-fixtures";
import { cn } from "@/lib/utils";

const inputCls =
  "w-full min-h-12 rounded-xl bg-transparent px-3 py-2 text-base text-foreground outline-none ring-1 ring-border/60 transition focus:ring-2 focus:ring-primary";

function IconBtn({
  label,
  onClick,
  children,
  danger,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors md:h-9 md:w-9",
        danger
          ? "text-muted-2 hover:bg-red-50 hover:text-red-600"
          : "text-muted-2 hover:bg-surface/70 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-border px-3 text-base font-semibold text-foreground transition-colors hover:bg-surface/70"
    >
      <Plus className="h-4 w-4" strokeWidth={2.25} />
      {children}
    </button>
  );
}

/** 개발전용 Changelog — 읽기/편집(어드민) 토글. */
export function DevChangelogEditor({
  initialState,
}: {
  initialState: DevChangelogState;
}) {
  const { scenarioId } = usePageUxPreview();
  const [saved, setSaved] = useState<DevChangelogState>(initialState);
  const [draft, setDraft] = useState<DevChangelogState | null>(null);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState("");

  const editing = draft !== null;

  const previewState = useMemo(() => {
    if (scenarioId === "empty") return fixtureDevChangelogEmpty();
    if (scenarioId === "full") return fixtureDevChangelogFull(saved);
    return null;
  }, [scenarioId, saved]);

  function startEdit() {
    if (previewState) return;
    setMsg("");
    setDraft(structuredClone(saved));
  }
  function cancel() {
    setDraft(null);
    setMsg("");
  }

  async function save() {
    if (!draft) return;
    setPending(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/changelog", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        state?: DevChangelogState;
      };
      if (!res.ok || !data.ok || !data.state) {
        setMsg(data.message ?? "저장 실패");
        return;
      }
      setSaved(data.state);
      setDraft(null);
    } catch {
      setMsg("저장 중 오류가 발생했습니다.");
    } finally {
      setPending(false);
    }
  }

  // ---- draft 수정 헬퍼 ----
  function patchAgendaDate(date: string) {
    setDraft((d) => (d ? { ...d, agenda: { ...d.agenda, date } } : d));
  }
  function patchAgendaItem(idx: number, next: { label?: string; done?: boolean }) {
    setDraft((d) => {
      if (!d) return d;
      const items = d.agenda.items.slice();
      items[idx] = { ...items[idx]!, ...next };
      return { ...d, agenda: { ...d.agenda, items } };
    });
  }
  function addAgendaItem() {
    setDraft((d) =>
      d
        ? { ...d, agenda: { ...d.agenda, items: [...d.agenda.items, { label: "", done: false }] } }
        : d,
    );
  }
  function removeAgendaItem(idx: number) {
    setDraft((d) =>
      d
        ? { ...d, agenda: { ...d.agenda, items: d.agenda.items.filter((_, i) => i !== idx) } }
        : d,
    );
  }

  function patchEntry(idx: number, next: Partial<DevChangelogState["entries"][number]>) {
    setDraft((d) => {
      if (!d) return d;
      const entries = d.entries.slice();
      entries[idx] = { ...entries[idx]!, ...next };
      return { ...d, entries };
    });
  }
  function addEntry() {
    const today = new Date().toISOString().slice(0, 10);
    setDraft((d) =>
      d
        ? {
            ...d,
            entries: [
              { version: "", date: today, title: "", summary: "", sections: [] },
              ...d.entries,
            ],
          }
        : d,
    );
  }
  function removeEntry(idx: number) {
    setDraft((d) => (d ? { ...d, entries: d.entries.filter((_, i) => i !== idx) } : d));
  }
  function patchSection(
    ei: number,
    si: number,
    next: { title?: string; items?: string[] },
  ) {
    setDraft((d) => {
      if (!d) return d;
      const entries = d.entries.slice();
      const sections = entries[ei]!.sections.slice();
      sections[si] = { ...sections[si]!, ...next };
      entries[ei] = { ...entries[ei]!, sections };
      return { ...d, entries };
    });
  }
  function addSection(ei: number) {
    setDraft((d) => {
      if (!d) return d;
      const entries = d.entries.slice();
      entries[ei] = {
        ...entries[ei]!,
        sections: [...entries[ei]!.sections, { title: "", items: [""] }],
      };
      return { ...d, entries };
    });
  }
  function removeSection(ei: number, si: number) {
    setDraft((d) => {
      if (!d) return d;
      const entries = d.entries.slice();
      entries[ei] = {
        ...entries[ei]!,
        sections: entries[ei]!.sections.filter((_, i) => i !== si),
      };
      return { ...d, entries };
    });
  }

  const agenda = previewState
    ? previewState.agenda
    : editing
      ? draft!.agenda
      : saved.agenda;
  const entries = previewState
    ? previewState.entries
    : editing
      ? draft!.entries
      : saved.entries;

  return (
    <div>
      {/* 페이지 AdminPageChrome 제목과 중복하지 않음. 편집 액션만. */}
      <div className="mb-6 flex flex-wrap items-center justify-end gap-2">
        {previewState ? null : editing ? (
          <>
            <button
              type="button"
              onClick={cancel}
              disabled={pending}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-border px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface/70 disabled:opacity-50"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
              취소
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={pending}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-full bg-primary px-4 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              <Check className="h-4 w-4" strokeWidth={2.5} />
              {pending ? "저장 중" : "저장"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex min-h-12 items-center gap-1.5 rounded-full border border-border px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface/70"
          >
            <Pencil className="h-4 w-4" strokeWidth={2.25} />
            편집
          </button>
        )}
      </div>

      {msg ? (
        <p className="mb-6 rounded-xl px-4 py-2.5 text-base font-medium text-muted ring-1 ring-border/60">
          {msg}
        </p>
      ) : null}

      {/* 개발안건 */}
      <section className="mb-12 border-b border-border/60 pb-10 sm:mb-14 sm:pb-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            오늘의 개발안건
          </h2>
          {editing ? (
            <input
              type="date"
              value={agenda.date}
              onChange={(e) => patchAgendaDate(e.target.value)}
              className="rounded-lg bg-surface px-2.5 py-1 text-xs tabular-nums text-foreground ring-1 ring-border/60 outline-none focus:ring-2 focus:ring-primary"
            />
          ) : (
            <p className="text-xs tabular-nums text-muted-2">
              {getChangelogDateLabel(agenda.date)}
            </p>
          )}
        </div>

        {editing ? (
          <div className="mt-4 space-y-2">
            {agenda.items.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={item.done ? "완료 해제" : "완료 표시"}
                  onClick={() => patchAgendaItem(i, { done: !item.done })}
                  className={cn(
                    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors",
                    item.done
                      ? "bg-primary text-primary-foreground ring-primary"
                      : "bg-surface text-transparent ring-border-strong hover:text-muted-2",
                  )}
                >
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                </button>
                <input
                  value={item.label}
                  onChange={(e) => patchAgendaItem(i, { label: e.target.value })}
                  placeholder="안건 내용"
                  className={inputCls}
                />
                <IconBtn label="삭제" danger onClick={() => removeAgendaItem(i)}>
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                </IconBtn>
              </div>
            ))}
            <AddButton onClick={addAgendaItem}>안건 추가</AddButton>
          </div>
        ) : agenda.items.length === 0 ? (
          <p className="mt-4 text-base text-muted">등록된 개발안건이 없습니다.</p>
        ) : (
          <ol className="mt-4 list-none space-y-2.5 border-l border-border pl-3.5">
            {agenda.items.map((item, index) => (
              <li
                key={index}
                className="flex gap-2.5 text-[15px] leading-[1.65] text-muted"
              >
                <span className="shrink-0 font-medium tabular-nums text-foreground/70">
                  {index + 1}.
                </span>
                <span className={item.done ? "text-muted-2 line-through" : ""}>
                  {item.label}
                </span>
                {item.done ? (
                  <span className="shrink-0 self-center rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-foreground/70">
                    완료
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Changelog 기록 */}
      {editing ? (
        <div className="space-y-6">
          <AddButton onClick={addEntry}>기록 추가</AddButton>
          {entries.map((entry, ei) => (
            <article
              key={ei}
              className="rounded-2xl bg-surface p-4 ring-1 ring-border/60 sm:p-5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="grid flex-1 gap-2 sm:grid-cols-[8rem_1fr]">
                  <input
                    type="date"
                    value={entry.date}
                    onChange={(e) => patchEntry(ei, { date: e.target.value })}
                    className={inputCls}
                  />
                  <input
                    value={entry.version}
                    onChange={(e) => patchEntry(ei, { version: e.target.value })}
                    placeholder="버전 (예: 0.7)"
                    className={inputCls}
                  />
                </div>
                <IconBtn label="기록 삭제" danger onClick={() => removeEntry(ei)}>
                  <Trash2 className="h-4 w-4" strokeWidth={2} />
                </IconBtn>
              </div>
              <input
                value={entry.title}
                onChange={(e) => patchEntry(ei, { title: e.target.value })}
                placeholder="제목"
                className={cn(inputCls, "mt-2 font-semibold")}
              />
              <textarea
                value={entry.summary}
                onChange={(e) => patchEntry(ei, { summary: e.target.value })}
                placeholder="요약"
                rows={2}
                className={cn(inputCls, "mt-2 resize-y leading-relaxed")}
              />

              <div className="mt-3 space-y-3 border-l border-border/60 pl-3">
                {entry.sections.map((section, si) => (
                  <div key={si} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        value={section.title}
                        onChange={(e) => patchSection(ei, si, { title: e.target.value })}
                        placeholder="섹션 제목"
                        className={cn(inputCls, "font-medium")}
                      />
                      <IconBtn label="섹션 삭제" danger onClick={() => removeSection(ei, si)}>
                        <Trash2 className="h-4 w-4" strokeWidth={2} />
                      </IconBtn>
                    </div>
                    <textarea
                      value={(section.items ?? []).join("\n")}
                      onChange={(e) =>
                        patchSection(ei, si, {
                          items: e.target.value.split("\n"),
                        })
                      }
                      placeholder="항목 (줄바꿈으로 구분)"
                      rows={Math.max(2, (section.items ?? []).length)}
                      className={cn(inputCls, "resize-y leading-relaxed")}
                    />
                  </div>
                ))}
                <AddButton onClick={() => addSection(ei)}>섹션 추가</AddButton>
              </div>
            </article>
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="rounded-2xl bg-card px-4 py-10 text-center text-base text-muted shadow-soft">
          표시할 변경 이력이 없습니다.
        </p>
      ) : (
        <ChangelogList entries={entries} />
      )}
    </div>
  );
}
