"use client";

import { Archive, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { MeetingSearch } from "@/components/dashboard/meeting-search";
import { Button } from "@/components/ui/button";
import { VaultFileIcon } from "@/components/vault/vault-file-icon";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { TOUCH_BUTTON, TOUCH_ICON_BUTTON, TOUCH_ROW } from "@/lib/touch-target";
import {
  VAULT_CHANGED_EVENT,
  formatVaultSize,
  getVaultItem,
  listVaultItems,
  type VaultItemMeta,
} from "@/lib/vault";
import { cn } from "@/lib/utils";

function isLikelyAudio(item: VaultItemMeta) {
  if (item.mime?.startsWith("audio/")) return true;
  return /\.(mp3|wav|m4a|aac|ogg|flac|webm|mp4|mpeg)$/i.test(item.name);
}

function formatVaultListDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * 보관함 파일 고르기.
 * 모바일: MD3 expanded bottom sheet (거의 전체 높이, 드래그 핸들, 최근 파일 우선).
 * 데스크탑: 중앙 다이얼로그.
 */
export function VaultPickerDialog({
  open,
  onClose,
  onPick,
  contained,
  /** 회의 업로드용: 음성 파일만 */
  audioOnly = false,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (file: File, meta: VaultItemMeta) => void;
  /** 디자인 랩: 프리뷰 영역 안에만 표시 */
  contained?: boolean;
  audioOnly?: boolean;
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

  const viewItems = useMemo(() => {
    if (forceEmpty) return [];
    const scoped = audioOnly ? items.filter(isLikelyAudio) : items;
    return [...scoped].sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        a.name.localeCompare(b.name, "ko"),
    );
  }, [forceEmpty, items, audioOnly]);

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

  const title = audioOnly ? "음성 고르기" : "보관함에서 선택";
  const subtitle = audioOnly
    ? "회의에 쓸 음성을 고르세요"
    : "보관함 파일을 회의에 첨부합니다";

  return (
    <div
      className={cn(
        "flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4",
        contained ? "absolute inset-0 z-10" : "fixed inset-0 z-[80]",
      )}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-picker-title"
        className={cn(
          // 모바일: MD3 expanded bottom sheet (긴 목록 브라우징용 거의 전체 높이)
          "flex w-full flex-col overflow-hidden bg-card shadow-float",
          "h-[min(92dvh,100%)] max-h-[92dvh] rounded-t-3xl",
          "sm:h-auto sm:max-h-[min(36rem,85vh)] sm:max-w-md sm:rounded-3xl",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {/* MD3 drag handle — 시트임을 바로 알 수 있게 */}
        <div
          className="flex shrink-0 justify-center pt-3 pb-1 sm:hidden"
          aria-hidden
        >
          <span className="h-1 w-10 rounded-full bg-border" />
        </div>

        <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-1 sm:gap-3 sm:px-4 sm:pt-4">
          <div className="min-w-0 flex-1 px-1">
            <h2
              id="vault-picker-title"
              className="text-lg font-semibold text-foreground sm:text-base"
            >
              {title}
            </h2>
            <p className="mt-0.5 text-base text-muted sm:text-sm">
              {subtitle}
              {!showLoading && viewItems.length > 0 ? (
                <span className="tabular-nums text-muted-2">
                  {`, ${viewItems.length}개`}
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              TOUCH_ICON_BUTTON,
              "shrink-0 cursor-pointer rounded-xl text-muted hover:bg-surface hover:text-foreground",
            )}
            aria-label="닫기"
          >
            <X strokeWidth={1.75} />
          </button>
        </div>

        {viewItems.length > 0 || query ? (
          <div className="shrink-0 px-4 pb-2">
            <MeetingSearch
              value={query}
              onChange={setQuery}
              placeholder="파일 이름 검색"
              label="보관함 파일 검색"
              className="max-w-none"
            />
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1">
          {showLoading ? (
            <div className="flex flex-col items-center gap-3 px-3 py-16 text-center">
              <Loader2
                className="h-7 w-7 animate-spin text-primary"
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="text-base text-muted sm:text-sm">불러오는 중…</p>
            </div>
          ) : error ? (
            <p className="px-3 py-12 text-center text-base text-muted sm:text-sm">
              {error}
            </p>
          ) : viewItems.length === 0 ? (
            <div className="px-3 py-14 text-center">
              <Archive
                className="mx-auto h-9 w-9 text-muted-2"
                strokeWidth={1.5}
              />
              <p className="mt-3 text-base font-medium text-foreground sm:text-sm">
                {audioOnly
                  ? "올릴 수 있는 음성이 없습니다"
                  : "보관함이 비어 있습니다"}
              </p>
              <p className="mt-1 text-base text-muted sm:text-sm">
                {audioOnly
                  ? "보관함에 음성 파일을 올려 둔 뒤 다시 열어 주세요."
                  : "보관함 메뉴에서 파일을 올려 주세요."}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-12 text-center text-base text-muted sm:text-sm">
              검색 결과가 없습니다.
            </p>
          ) : (
            <ul className="space-y-0.5 pb-2">
              {filtered.map((item) => {
                const dateLabel = formatVaultListDate(item.createdAt);
                const busy = pickingId === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      disabled={Boolean(pickingId)}
                      onClick={() => void pick(item)}
                      aria-label={`${item.name}, ${formatVaultSize(item.size)}${dateLabel ? `, ${dateLabel}` : ""}`}
                      className={cn(
                        TOUCH_ROW,
                        "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                        "hover:bg-surface active:bg-surface",
                        "disabled:cursor-wait disabled:opacity-60",
                        busy && "bg-surface",
                      )}
                    >
                      <VaultFileIcon
                        name={item.name}
                        mime={item.mime}
                        size={20}
                        className="h-11 w-11 shrink-0 rounded-xl sm:h-9 sm:w-9"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-semibold leading-snug text-foreground sm:text-base">
                          {item.name}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-base tabular-nums text-muted sm:text-sm">
                          <span>{formatVaultSize(item.size)}</span>
                          {dateLabel ? (
                            <span className="text-muted-2">{dateLabel}</span>
                          ) : null}
                        </span>
                      </span>
                      {busy ? (
                        <Loader2
                          className="h-5 w-5 shrink-0 animate-spin text-primary"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div
          className={cn(
            "shrink-0 border-t border-border px-4 pt-3",
            "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]",
            "sm:pb-4",
          )}
        >
          <Button
            type="button"
            variant="outline"
            className={cn(TOUCH_BUTTON, "w-full cursor-pointer text-base sm:text-sm")}
            onClick={onClose}
          >
            취소
          </Button>
        </div>
      </div>
    </div>
  );
}
