import { cn } from "@/lib/utils";

/** 페이지 좌우 여백과 최대 폭을 통일하는 레이아웃 래퍼.
 *  반응형은 작은/큰 2단만 사용 (중간 애매한 단계 없음).
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
        "mx-auto w-full max-w-7xl px-6 xl:px-12",
        className,
      )}
    >
      {children}
    </div>
  );
}
