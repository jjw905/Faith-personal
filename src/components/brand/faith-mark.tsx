type FaithMarkProps = {
  className?: string;
  /** 대기 상태를 살아있게 보여줄 때만 켠다(예: 리스닝 표시). 기본은 정적 마크. */
  animated?: boolean;
};

/**
 * Faith mark = cross core + voice wave wings.
 * Cross: two rounded bars crossing at center (24/32 viewBox center).
 * Wings: one equalizer cluster, rotated 4x around center, sitting on each cross tip.
 */
const WING_BARS = [
  { x: 11.5, y: 2, width: 2.2, height: 4 },
  { x: 14.9, y: 1, width: 2.4, height: 5 },
  { x: 18.4, y: 3, width: 2.2, height: 3 },
] as const;

const WING_ROTATIONS = [0, 90, 180, 270] as const;

export function FaithMark({ className, animated = false }: FaithMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x={13.4}
        y={6}
        width={5.2}
        height={20}
        rx={2.6}
        fill="currentColor"
      />
      <rect
        x={6}
        y={13.4}
        width={20}
        height={5.2}
        rx={2.6}
        fill="currentColor"
      />
      {WING_ROTATIONS.map((angle, wing) => (
        <g key={angle} transform={`rotate(${angle} 16 16)`}>
          {WING_BARS.map((bar, i) => (
            <rect
              key={i}
              x={bar.x}
              y={bar.y}
              width={bar.width}
              height={bar.height}
              rx={bar.width / 2}
              fill="currentColor"
              className={animated ? "faith-mark-bar" : undefined}
              style={
                animated
                  ? { animationDelay: `${wing * 120 + i * 80}ms` }
                  : undefined
              }
            />
          ))}
          <circle cx={16.1} cy={0.2} r={1.15} fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}
