"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { resolveWorkspacePerson } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";

export function PersonAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const person = resolveWorkspacePerson(name);
  return (
    <Avatar
      className={cn(
        size === "sm" && "h-8 w-8",
        size === "md" && "h-9 w-9",
        size === "lg" && "h-14 w-14",
        "border-2 border-card",
        className,
      )}
    >
      <AvatarFallback
        className={cn(
          "font-semibold text-white",
          size === "lg" ? "text-lg" : "text-[11px]",
          person.color,
        )}
      >
        {person.initials}
      </AvatarFallback>
    </Avatar>
  );
}

export function displayPersonName(
  name: string | null | undefined,
  handle?: string | null,
) {
  if (name?.trim()) return name.trim();
  if (handle?.trim()) return `@${handle.trim()}`;
  return "참가자";
}
