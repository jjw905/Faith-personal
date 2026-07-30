"use client";

import Link from "next/link";
import { Check, UserPlus } from "lucide-react";

import {
  PersonAvatar,
  displayPersonName,
} from "@/components/people/person-avatar";
import { cn } from "@/lib/utils";

export type ParticipantOption = {
  userId: string;
  user: { name: string | null; handle: string | null };
};

export function ParticipantChipPicker({
  members,
  selectedIds,
  onChange,
  label = "팀원 초대",
  required = false,
  emptyHref = "/team?manage=invite",
  emptyLabel = "팀에 멤버 초대",
  disabled = false,
}: {
  members: ParticipantOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  required?: boolean;
  emptyHref?: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const selectedCount = selectedIds.length;
  const allSelected =
    members.length > 0 && selectedCount === members.length;

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="flex w-full flex-wrap items-center justify-between gap-2">
        <span className="text-base font-medium">
          {label}
          {required ? (
            <span className="ml-1 text-base font-semibold text-primary">
              필수
            </span>
          ) : null}
        </span>
        {members.length > 0 ? (
          <span className="text-base tabular-nums text-muted">
            {selectedCount}/{members.length}
          </span>
        ) : null}
      </legend>

      {members.length === 0 ? (
        <div className="mt-2 rounded-2xl bg-surface p-4">
          <p className="text-base text-muted">초대할 팀원이 없습니다.</p>
          <Link
            href={emptyHref}
            className="mt-3 inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-4 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            <UserPlus className="h-5 w-5" strokeWidth={1.75} />
            {emptyLabel}
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-2 flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-2xl bg-surface p-3">
            {members.map((member) => {
              const selected = selectedIds.includes(member.userId);
              const name = displayPersonName(
                member.user.name,
                member.user.handle,
              );
              return (
                <button
                  key={member.userId}
                  type="button"
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      selected
                        ? selectedIds.filter((id) => id !== member.userId)
                        : [...selectedIds, member.userId],
                    )
                  }
                  className={cn(
                    "inline-flex min-h-12 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-base font-medium transition-[background-color,border-color,color] duration-180 ease-out motion-reduce:transition-none",
                    selected
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border bg-card text-foreground hover:bg-card/80",
                    disabled && "pointer-events-none opacity-60",
                  )}
                >
                  <span className="relative">
                    <PersonAvatar
                      name={name}
                      size="sm"
                      className="border-transparent"
                    />
                    {selected ? (
                      <span className="absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                    ) : null}
                  </span>
                  <span className="max-w-[8rem] truncate">{name}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={disabled || allSelected}
              onClick={() => onChange(members.map((row) => row.userId))}
              className="inline-flex min-h-12 items-center rounded-full bg-surface px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50"
            >
              모두 선택
            </button>
            {selectedCount > 0 ? (
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange([])}
                className="inline-flex min-h-12 items-center rounded-full px-4 text-base font-semibold text-muted transition-colors hover:bg-surface hover:text-foreground disabled:opacity-50"
              >
                선택 해제
              </button>
            ) : null}
          </div>
        </>
      )}
    </fieldset>
  );
}
