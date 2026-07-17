"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserProfile } from "@/components/layout/user-profile";
import { APP_NAME, NAV_ITEMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }
    if (href === "/meetings") {
      return (
        pathname === "/meetings" ||
        (pathname.startsWith("/meetings/") &&
          !pathname.startsWith("/meetings/live-mask"))
      );
    }
    if (href === "/meetings/live-mask") {
      return pathname.startsWith("/meetings/live-mask");
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="flex h-screen w-60 shrink-0 flex-col bg-card">
      <div className="flex h-16 items-center px-5">
        <p className="text-lg font-bold tracking-tight text-foreground">
          {APP_NAME}
        </p>
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        <nav className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-surface text-foreground"
                    : "text-muted hover:bg-surface hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-primary" : "text-muted-2",
                  )}
                />
                <span className="flex-1">{item.title}</span>
                {"badge" in item && item.badge ? (
                  <Badge
                    variant="sidebar"
                    className={cn(
                      "min-w-5 justify-center px-1.5 py-0 text-[10px]",
                      active && "bg-primary-soft text-primary",
                    )}
                  >
                    {item.badge}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      <div className="p-3">
        <UserProfile />
      </div>
    </aside>
  );
}
