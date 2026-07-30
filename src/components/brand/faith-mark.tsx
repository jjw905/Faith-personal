type FaithMarkProps = {
  className?: string;
  /** 대기 상태를 살아있게 보여줄 때만 켠다(예: 리스닝 표시). 기본은 정적 마크. */
  animated?: boolean;
};

/** 음성 파형 5줄 — 세로 바 + full radius. 사이드바·파비콘 등 브랜드 마크 전반에서 재사용. */
const BARS = [
  { x: 2, y: 7, height: 10 },
  { x: 6.4, y: 4, height: 16 },
  { x: 10.8, y: 1, height: 22 },
  { x: 15.2, y: 8, height: 8 },
  { x: 19.6, y: 5, height: 14 },
] as const;

export function FaithMark({ className, animated = false }: FaithMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {BARS.map((bar, i) => (
        <rect
          key={i}
          x={bar.x}
          y={bar.y}
          width={2.4}
          height={bar.height}
          rx={1.2}
          fill="currentColor"
          className={animated ? "faith-mark-bar" : undefined}
          style={animated ? { animationDelay: `${i * 90}ms` } : undefined}
        />
      ))}
    </svg>
  );
}
