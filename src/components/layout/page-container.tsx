import { AppLegalFooter } from "@/components/layout/app-legal-footer";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  /** 회의 집중 모드 등에서 하단 법적 고지 숨김 */
  hideFooter?: boolean;
}

export function PageContainer({
  children,
  className,
  hideFooter = false,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col overflow-y-auto bg-background p-4 sm:p-6",
        className,
      )}
    >
      <div className="flex min-h-full flex-1 flex-col">
        <div className="flex-1">{children}</div>
        {hideFooter ? null : <AppLegalFooter />}
      </div>
    </div>
  );
}
