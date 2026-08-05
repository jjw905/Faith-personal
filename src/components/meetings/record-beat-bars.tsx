import { cn } from "@/lib/utils";

const BAR_COUNTS = { sm: 5, md: 5, lg: 7 } as const;

/**
 * 녹음 중 비트/웨이브 막대.
 * 색은 text-* 만. 면·원형 배경은 부모에서 넣지 않는다.
 */
export function RecordBeatBars({
  className,
  size = "sm",
}: {
  className?: string;
  size?: keyof typeof BAR_COUNTS;
}) {
  const count = BAR_COUNTS[size];
  return (
    <span
      className={cn(
        "record-beat-bars",
        size === "md" && "record-beat-bars--md",
        size === "lg" && "record-beat-bars--lg",
        className,
      )}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) => (
        <span key={i} />
      ))}
    </span>
  );
}
