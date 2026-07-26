"use client";

import { Check } from "lucide-react";

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
  label = "참가자",
}: {
  members: ParticipantOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  if (members.length === 0) return null;

  return (
    <fieldset>
      <legend className="text-base font-medium">{label}</legend>
      <div className="mt-2 flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-2xl bg-surface p-3">
        {members.map((member) => {
          const selected = selectedIds.includes(member.userId);
          const name = displayPersonName(member.user.name, member.user.handle);
          return (
            <button
              key={member.userId}
              type="button"
              aria-pressed={selected}
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
    </fieldset>
  );
}
