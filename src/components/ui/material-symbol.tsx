import { cn } from "@/lib/utils";

type MaterialSymbolProps = {
  name: string;
  className?: string;
  /** 24 default, header controls often use 24 */
  size?: number;
  filled?: boolean;
  weight?: 300 | 400 | 500;
  "aria-hidden"?: boolean | "true" | "false";
};

/**
 * Google Material Symbols Outlined (M3).
 * Lucide와 다른 시리즈 — 알림 등 포인트 아이콘에 사용.
 * 리가처가 없으면 글자열이 가로로 넘친다. width/height·overflow로 막는다.
 */
export function MaterialSymbol({
  name,
  className,
  size = 24,
  filled = false,
  weight = 400,
  "aria-hidden": ariaHidden = true,
}: MaterialSymbolProps) {
  return (
    <span
      className={cn(
        "material-symbols-outlined inline-flex shrink-0 items-center justify-center overflow-hidden",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size,
        lineHeight: 1,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${Math.min(48, Math.max(20, size))}`,
      }}
      aria-hidden={ariaHidden}
    >
      {name}
    </span>
  );
}
