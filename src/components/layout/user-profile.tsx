"use client";

import { Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAppContext } from "@/context/app-context";
import { cn } from "@/lib/utils";

export function UserProfile({ onNavigate }: { onNavigate?: () => void }) {
  const { currentUser } = useAppContext();
  const pathname = usePathname();
  const active = pathname === "/account";

  return (
    <Link
      href="/account"
      onClick={onNavigate}
      className={cn(
        "group flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 outline-none transition-colors",
        "hover:bg-surface-2",
        "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
        "active:bg-surface-2",
        active && "bg-surface",
      )}
    >
      <Avatar className="h-8 w-8">
        <AvatarFallback className="bg-primary text-xs font-medium text-primary-foreground">
          {currentUser.avatarInitials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {currentUser.name}
        </p>
        <p className="truncate text-[11px] text-muted-2 group-hover:text-muted">
          계정 설정
        </p>
      </div>
      <Settings className="h-4 w-4 shrink-0 text-muted-2 transition-colors group-hover:text-foreground" />
    </Link>
  );
}
