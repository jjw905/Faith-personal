import { MaterialSymbol } from "@/components/ui/material-symbol";
import { vaultFileSymbol } from "@/lib/vault-file-icon";
import { cn } from "@/lib/utils";

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
  return (
    <span
      className={cn(
        "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground",
        className,
      )}
      aria-hidden
    >
      <MaterialSymbol
        name={vaultFileSymbol(name, mime)}
        size={size}
        weight={400}
      />
    </span>
  );
}
