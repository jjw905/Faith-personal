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
      className={cn("material-symbols-outlined", className)}
      style={{
        fontSize: size,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${Math.min(48, Math.max(20, size))}`,
      }}
      aria-hidden={ariaHidden}
    >
      {name}
    </span>
  );
}
