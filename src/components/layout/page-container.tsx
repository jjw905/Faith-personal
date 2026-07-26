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
        "flex flex-1 flex-col bg-app-canvas p-4 pb-4 sm:p-6 sm:pb-4",
        className,
      )}
    >
      <div className="flex flex-col">
        {children}
        {hideFooter ? null : <AppLegalFooter />}
      </div>
    </div>
  );
}
