import { cn } from "@/lib/utils";

/** 페이지 좌우 여백과 최대 폭을 통일하는 레이아웃 래퍼.
 *  패딩·폭은 clamp로 연속 변화 (breakpoint 스냅 최소화).
 */
export function Container({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[min(100%,80rem)] px-[clamp(1.5rem,3.5vw,3rem)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
