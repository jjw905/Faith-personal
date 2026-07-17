import { cn } from "@/lib/utils";

/** 페이지 좌우 여백과 최대 폭을 통일하는 레이아웃 래퍼. */
export function Container({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-6 sm:px-8", className)}>
      {children}
    </div>
  );
}
