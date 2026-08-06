import { MaterialSymbol } from "@/components/ui/material-symbol";
import { vaultFileExtLabel, vaultFileSymbol } from "@/lib/vault-file-icon";
import { cn } from "@/lib/utils";

/**
 * 파일 타일. 확장자를 익숙한 소문자로 보여준다(m4a, mp4, jpg).
 * 확장자를 못 읽는 파일만 Material 심볼로 대체한다.
 */
export function VaultFileIcon({
  name,
  mime,
  size = 20,
  className,
}: {
  name: string;
  mime?: string;
  size?: number;
  className?: string;
}) {
  const ext = vaultFileExtLabel(name);

  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-surface-2 text-foreground",
        className,
      )}
      aria-hidden
    >
      {ext ? (
        <span
          className="font-extrabold leading-none tracking-[-0.03em]"
          style={{ fontSize: Math.round(size * 0.62) }}
        >
          {ext}
        </span>
      ) : (
        <MaterialSymbol name={vaultFileSymbol(name, mime)} size={size} weight={500} />
      )}
    </span>
  );
}
