import type { LucideIcon } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";

interface PageSkeletonProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function PageSkeleton({
  title,
  description,
  icon: Icon,
}: PageSkeletonProps) {
  return (
    <PageContainer>
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-center rounded-3xl bg-card px-8 py-16 text-center shadow-soft">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-muted">
          <Icon className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted">
          {description}
        </p>
        <p className="mt-6 rounded-full bg-surface px-4 py-1.5 text-xs font-medium text-muted">
          곧 상세 UI가 제공됩니다
        </p>
      </div>
    </PageContainer>
  );
}
