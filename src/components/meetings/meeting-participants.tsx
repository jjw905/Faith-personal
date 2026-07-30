"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Participant } from "@/types/meeting";
import { cn } from "@/lib/utils";

type PersonKind = "member" | "guest" | "voice";

const KIND_ORDER: PersonKind[] = ["member", "guest", "voice"];

const KIND_LABEL: Record<PersonKind, string> = {
  member: "회원",
  guest: "게스트",
  voice: "화자",
};

const TAG_VISIBLE = 3;

function personKind(p: Participant): PersonKind {
  if (p.recognition === "guest") return "guest";
  if (p.recognition === "voice") return "voice";
  if (p.recognition === "member" || p.isMember === true) return "member";
  return "voice";
}

function groupParticipants(participants: Participant[]) {
  return KIND_ORDER.map((kind) => ({
    kind,
    people: participants.filter((p) => personKind(p) === kind),
  })).filter((g) => g.people.length > 0);
}

async function saveParticipantName(input: {
  meetingId: string;
  participantId: string;
  name: string;
}) {
  const res = await fetch(`/api/meetings/${input.meetingId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      renameParticipant: { id: input.participantId, name: input.name },
    }),
  });
  const data = (await res.json()) as { ok?: boolean; message?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.message ?? "이름 수정 실패");
  }
}

function ParticipantNameEditor({
  meetingId,
  person,
  className,
  onRenamed,
  onCancel,
}: {
  meetingId: string;
  person: Participant;
  className?: string;
  onRenamed: (from: string, to: string) => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(person.name);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  async function save() {
    const next = value.trim();
    if (!next || next === person.name || busy) {
      onCancel();
      setValue(person.name);
      return;
    }
    setBusy(true);
    try {
      await saveParticipantName({
        meetingId,
        participantId: person.id,
        name: next,
      });
      onRenamed(person.name, next);
      router.refresh();
    } catch {
      setValue(person.name);
      onCancel();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className={cn("min-w-0", className)}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            setValue(person.name);
            onCancel();
          }
          e.stopPropagation();
        }}
        onClick={(e) => e.stopPropagation()}
        disabled={busy}
        aria-label={`${person.name} 이름 수정`}
        className="h-12 w-full max-w-[10rem] border-b border-foreground bg-transparent py-1 text-base font-semibold leading-5 text-foreground outline-none disabled:opacity-60 md:h-auto md:py-0.5 md:text-sm"
      />
    </form>
  );
}

function RenamePencil({
  name,
  onEdit,
}: {
  name: string;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
      className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted opacity-100 transition-opacity hover:bg-surface-2 hover:text-foreground sm:opacity-0 sm:group-hover/person:opacity-100 sm:focus-visible:opacity-100 md:h-6 md:w-6 md:rounded-md"
      aria-label={`${name} 이름 수정`}
      title="이름 수정"
    >
      <Pencil className="h-4 w-4 md:h-3 md:w-3" strokeWidth={2} aria-hidden />
    </button>
  );
}

function PeopleRow({
  people,
  selectedName,
  onSelectName,
  meetingId,
  canEdit,
  editingId,
  onStartEdit,
  onStopEdit,
  onRenamed,
}: {
  people: Participant[];
  selectedName?: string | null;
  onSelectName?: (name: string) => void;
  meetingId?: string;
  canEdit?: boolean;
  editingId: string | null;
  onStartEdit?: (id: string) => void;
  onStopEdit?: () => void;
  onRenamed?: (from: string, to: string) => void;
}) {
  return (
    <ul className="flex min-w-0 flex-wrap gap-x-3 gap-y-2.5">
      {people.map((p) => {
        const selected = selectedName === p.name;
        const interactive = Boolean(onSelectName);
        const editing = Boolean(canEdit && meetingId && editingId === p.id && onRenamed && onStopEdit);

        const avatar = (
          <Avatar className="h-10 w-10 shrink-0 md:h-8 md:w-8">
            <AvatarFallback
              className={cn(
                "text-sm font-semibold leading-none text-white md:text-xs",
                p.color,
              )}
            >
              {p.initials}
            </AvatarFallback>
          </Avatar>
        );

        if (editing && meetingId && onRenamed && onStopEdit) {
          return (
            <li
              key={p.id}
              className="inline-flex max-w-full items-center gap-2"
              title={p.recognitionNote || undefined}
            >
              {avatar}
              <ParticipantNameEditor
                meetingId={meetingId}
                person={p}
                onRenamed={onRenamed}
                onCancel={onStopEdit}
              />
            </li>
          );
        }

        const nameLabel = (
          <span className="max-w-[7.5rem] truncate text-base font-medium leading-5 text-foreground md:text-sm md:leading-4">
            {p.name}
          </span>
        );

        return (
          <li
            key={p.id}
            className="group/person inline-flex max-w-full items-center gap-2 md:gap-0.5"
            title={p.recognitionNote || undefined}
          >
            {interactive ? (
              <button
                type="button"
                onClick={() => onSelectName?.(p.name)}
                aria-pressed={selected}
                className={cn(
                  "inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full pr-3 pl-1 transition-colors md:h-8 md:min-h-0 md:pr-2.5 md:pl-0.5",
                  selected
                    ? "bg-primary-soft ring-1 ring-primary/30"
                    : "hover:bg-surface-2",
                )}
              >
                {avatar}
                {nameLabel}
              </button>
            ) : (
              <span className="inline-flex min-h-12 items-center gap-2 md:h-8 md:min-h-0">
                {avatar}
                {nameLabel}
              </span>
            )}
            {canEdit && onStartEdit ? (
              <RenamePencil name={p.name} onEdit={() => onStartEdit(p.id)} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 종류 = 왼쪽 비교 축, 사람 = 오른쪽.
 * 종류가 하나뿐이면 축을 생략해 참석 N / 화자 N 이중 표기를 피함.
 */
export function GroupedParticipantsList({
  participants,
  className,
  selectedName,
  onSelectName,
  meetingId,
  canEdit,
  editingId = null,
  onStartEdit,
  onStopEdit,
  onRenamed,
}: {
  participants: Participant[];
  className?: string;
  selectedName?: string | null;
  onSelectName?: (name: string) => void;
  meetingId?: string;
  canEdit?: boolean;
  editingId?: string | null;
  onStartEdit?: (id: string) => void;
  onStopEdit?: () => void;
  onRenamed?: (from: string, to: string) => void;
}) {
  if (participants.length === 0) return null;

  const grouped = groupParticipants(participants);
  const rowProps = {
    selectedName,
    onSelectName,
    meetingId,
    canEdit,
    editingId,
    onStartEdit,
    onStopEdit,
    onRenamed,
  };

  if (grouped.length === 1) {
    return (
      <div className={className}>
        <PeopleRow people={grouped[0].people} {...rowProps} />
      </div>
    );
  }

  return (
    <ul className={cn("space-y-5", className)}>
      {grouped.map(({ kind, people }) => (
        <li key={kind} className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-muted">
            {KIND_LABEL[kind]}
            <span className="ml-1.5 tabular-nums">{people.length}</span>
          </p>
          <PeopleRow people={people} {...rowProps} />
        </li>
      ))}
    </ul>
  );
}

type SpeakerRow = {
  person: Participant;
  summary: string;
  tags: string[];
};

/**
 * 발화자별 한 줄 요약 + 역할 태그.
 * 예: "UI/UX 맡음" / [디자인] [프론트]
 */
function SpeakerContributionList({
  rows,
  selectedName,
  onSelectName,
  meetingId,
  canEdit,
  editingId,
  onStartEdit,
  onStopEdit,
  onRenamed,
}: {
  rows: SpeakerRow[];
  selectedName?: string | null;
  onSelectName?: (name: string) => void;
  meetingId?: string;
  canEdit?: boolean;
  editingId: string | null;
  onStartEdit?: (id: string) => void;
  onStopEdit?: () => void;
  onRenamed?: (from: string, to: string) => void;
}) {
  return (
    <ul className="space-y-3" aria-label="발화자별 기여">
      {rows.map(({ person, summary, tags }) => {
        const selected = selectedName === person.name;
        const interactive = Boolean(onSelectName);
        const editing = Boolean(
          canEdit && meetingId && editingId === person.id && onRenamed && onStopEdit,
        );

        return (
          <li key={person.id}>
            <div
              className={cn(
                "group/person -m-1 flex gap-3 rounded-xl p-1 transition-colors",
                selected && "bg-primary-soft/60",
              )}
            >
              {editing && meetingId && onRenamed && onStopEdit ? (
                <>
                  <Avatar className="mt-0.5 h-8 w-8 shrink-0">
                    <AvatarFallback
                      className={cn(
                        "text-xs font-semibold leading-none text-white",
                        person.color,
                      )}
                    >
                      {person.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <ParticipantNameEditor
                      meetingId={meetingId}
                      person={person}
                      onRenamed={onRenamed}
                      onCancel={onStopEdit}
                    />
                    {summary ? (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted">
                        {summary}
                      </p>
                    ) : null}
                  </div>
                </>
              ) : interactive ? (
                <>
                  <button
                    type="button"
                    onClick={() => onSelectName?.(person.name)}
                    aria-pressed={selected}
                    className="flex min-h-12 min-w-0 flex-1 cursor-pointer gap-3 py-1 text-left md:min-h-0 md:py-0"
                  >
                    <SpeakerContributionBody
                      person={person}
                      summary={summary}
                      tags={tags}
                    />
                  </button>
                  {canEdit && onStartEdit ? (
                    <RenamePencil
                      name={person.name}
                      onEdit={() => onStartEdit(person.id)}
                    />
                  ) : null}
                </>
              ) : (
                <>
                  <SpeakerContributionBody
                    person={person}
                    summary={summary}
                    tags={tags}
                  />
                  {canEdit && onStartEdit ? (
                    <RenamePencil
                      name={person.name}
                      onEdit={() => onStartEdit(person.id)}
                    />
                  ) : null}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SpeakerContributionBody({
  person,
  summary,
  tags,
}: SpeakerRow) {
  return (
    <>
      <Avatar className="mt-0.5 h-10 w-10 shrink-0 md:h-8 md:w-8">
        <AvatarFallback
          className={cn(
            "text-sm font-semibold leading-none text-white md:text-xs",
            person.color,
          )}
        >
          {person.initials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <span
          className="block min-w-0 truncate text-base font-semibold leading-5 text-foreground md:text-sm"
          title={person.recognitionNote || person.name}
        >
          {person.name}
        </span>
        {summary ? (
          <p
            className="mt-0.5 line-clamp-2 text-base leading-5 text-muted md:text-xs md:leading-4"
            title={summary}
          >
            {summary}
          </p>
        ) : null}
        {tags.length > 0 ? (
          <ul className="mt-1.5 flex min-w-0 flex-wrap gap-1">
            {tags.map((tag) => (
              <li
                key={tag}
                className="max-w-full rounded-md bg-surface-2 px-1.5 py-0.5 text-sm font-semibold leading-4 text-foreground md:text-xs"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}

function buildContributionRows(participants: Participant[]): SpeakerRow[] {
  return participants.map((person) => ({
    person,
    summary: (person.summary || "").trim(),
    tags: (person.tags ?? [])
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, TAG_VISIBLE),
  }));
}

function hasContribution(p: Participant) {
  return Boolean(p.summary?.trim()) || (p.tags?.length ?? 0) > 0;
}

/** 회의 상세용 참석. 요약 블록과 같은 좌측·패딩 기준. */
export function MeetingParticipants({
  participants,
  selectedName,
  onSelectName,
  meetingId,
  canEdit = false,
  onParticipantRenamed,
}: {
  participants: Participant[];
  selectedName?: string | null;
  onSelectName?: (name: string) => void;
  meetingId?: string;
  canEdit?: boolean;
  onParticipantRenamed?: (from: string, to: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  if (participants.length === 0) return null;

  const useContributionList =
    participants.length > 1 && participants.some(hasContribution);

  function handleRenamed(from: string, to: string) {
    setEditingId(null);
    onParticipantRenamed?.(from, to);
  }

  const editProps = {
    meetingId,
    canEdit: canEdit && Boolean(meetingId),
    editingId,
    onStartEdit: (id: string) => setEditingId(id),
    onStopEdit: () => setEditingId(null),
    onRenamed: handleRenamed,
  };

  return (
    <section
      className="panel-surface rounded-2xl px-4 py-4 sm:px-5"
      aria-label={`참석자 ${participants.length}명`}
    >
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted-2 md:text-xs">
          참석
        </h2>
        <span className="text-sm font-semibold tabular-nums text-muted-2 md:text-xs">
          {participants.length}
        </span>
        {selectedName ? (
          <span className="text-base font-medium text-primary md:text-xs">
            {selectedName} 구간
          </span>
        ) : null}
      </div>
      {useContributionList ? (
        <SpeakerContributionList
          rows={buildContributionRows(participants)}
          selectedName={selectedName}
          onSelectName={onSelectName}
          {...editProps}
        />
      ) : (
        <GroupedParticipantsList
          participants={participants}
          selectedName={selectedName}
          onSelectName={onSelectName}
          {...editProps}
        />
      )}
    </section>
  );
}
