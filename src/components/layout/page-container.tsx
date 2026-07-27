import { AppLegalFooter } from "@/components/layout/app-legal-footer";
import { cn } from "@/lib/utils";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  /** 회의 집중 모드 등에서 하단 법적 고지 숨김 */
  hideFooter?: boolean;
  /** 앱 캔버스(회색) 대신 흰 배경 */
  white?: boolean;
  /** 아주 옅은 배경(#fbfbfd). 흰 카드가 살짝만 구분되게 */
  soft?: boolean;
}

export function PageContainer({
  children,
  className,
  hideFooter = false,
  white = false,
  soft = false,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col px-4 pb-4 pt-1 sm:px-6 sm:pb-4 sm:pt-2",
        white ? "bg-white" : soft ? "bg-background" : "bg-app-canvas",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col">
        {children}
        {hideFooter ? null : <AppLegalFooter />}
      </div>
    </div>
  );
}
