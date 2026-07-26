"use client";

import { Archive, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { MeetingSearch } from "@/components/dashboard/meeting-search";
import { Button } from "@/components/ui/button";
import { VaultFileIcon } from "@/components/vault/vault-file-icon";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  VAULT_CHANGED_EVENT,
  formatVaultSize,
  getVaultItem,
  listVaultItems,
  type VaultItemMeta,
} from "@/lib/vault";
import { cn } from "@/lib/utils";

export function VaultPickerDialog({
  open,
  onClose,
  onPick,
  contained,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (file: File, meta: VaultItemMeta) => void;
  /** 디자인 랩: 프리뷰 영역 안에만 표시 */
  contained?: boolean;
}) {
  const { scenarioId } = usePageUxPreview();
  const [items, setItems] = useState<VaultItemMeta[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const forceLoading = scenarioId === "popup-vault-picker-loading";
  const forceEmpty = scenarioId === "popup-vault-picker-empty";
  const showLoading = loading || forceLoading;
  const viewItems = forceEmpty ? [] : items;

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const next = await listVaultItems();
        if (alive) setItems(next);
      } catch {
        if (alive) setError("보관함을 불러오지 못했습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    void load();
    function onChanged() {
      void load();
    }
    window.addEventListener(VAULT_CHANGED_EVENT, onChanged);
    return () => {
      alive = false;
      window.removeEventListener(VAULT_CHANGED_EVENT, onChanged);
    };
  }, [open]);

  useEffect(() => {
    if (!open || contained) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose, contained]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return viewItems;
    return viewItems.filter((item) => item.name.toLowerCase().includes(q));
  }, [viewItems, query]);

  async function pick(meta: VaultItemMeta) {
    setPickingId(meta.id);
    setError(null);
    try {
      const item = await getVaultItem(meta.id);
      if (!item) {
        setError("파일을 찾을 수 없습니다.");
        return;
      }
      const file = new File([item.blob], item.name, {
        type: item.mime,
        lastModified: Date.parse(item.createdAt) || 0,
      });
      onPick(file, meta);
      onClose();
    } catch {
      setError("파일을 열지 못했습니다.");
    } finally {
      setPickingId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className={cn(
        "flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4",
        contained
          ? "absolute inset-0 z-10"
          : "fixed inset-0 z-[80]",
      )}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-picker-title"
        className="flex max-h-[min(32rem,85vh)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-card shadow-float sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
          <div className="min-w-0">
            <h2
              id="vault-picker-title"
              className="text-base font-semibold text-foreground"
            >
              보관함에서 선택
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              보관함 파일을 회의에 첨부합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-foreground"
            aria-label="닫기"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        {viewItems.length > 0 || query ? (
          <div className="px-4 pb-2">
            <MeetingSearch
              value={query}
              onChange={setQuery}
              placeholder="파일 검색"
              label="보관함 파일 검색"
              className="max-w-none"
            />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {showLoading ? (
            <div className="flex flex-col items-center gap-3 px-3 py-10 text-center">
              <Loader2
                className="h-6 w-6 animate-spin text-primary"
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="text-sm text-muted">불러오는 중…</p>
            </div>
          ) : error ? (
            <p className="px-3 py-8 text-center text-sm text-muted">{error}</p>
          ) : viewItems.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <Archive
                className="mx-auto h-8 w-8 text-muted-2"
                strokeWidth={1.5}
              />
              <p className="mt-3 text-sm text-muted">보관함이 비어 있습니다.</p>
              <p className="mt-1 text-xs text-muted-2">
                보관함 메뉴에서 파일을 올려 주세요.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted">
              검색 결과가 없습니다.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    disabled={pickingId === item.id}
                    onClick={() => void pick(item)}
                    aria-label={`${item.name}, ${formatVaultSize(item.size)}`}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                      "hover:bg-surface disabled:cursor-wait disabled:opacity-60",
                    )}
                  >
                    <VaultFileIcon
                      name={item.name}
                      mime={item.mime}
                      size={18}
                      className="rounded-xl"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block text-xs tabular-nums text-muted">
                        {formatVaultSize(item.size)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-3">
          <Button
            type="button"
            variant="outline"
            className="w-full cursor-pointer"
            onClick={onClose}
          >
            취소
          </Button>
        </div>
      </div>
    </div>
  );
}
