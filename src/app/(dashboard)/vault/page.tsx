"use client";

import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Inbox,
  MoreHorizontal,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { VaultFileIcon } from "@/components/vault/vault-file-icon";
import { VaultDeleteConfirmDialog } from "@/components/vault/vault-delete-confirm-dialog";
import {
  VaultFloatSearch,
  VaultRoundSearch,
} from "@/components/vault/vault-float-search";
import { VaultMobileActionBar } from "@/components/vault/vault-mobile-action-bar";
import { VaultUploadDialog } from "@/components/vault/vault-upload-dialog";
import { DuplicateVaultNameDialog } from "@/components/vault/duplicate-name-dialog";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  fixtureVaultItemsFull,
  fixtureVaultUsage,
} from "@/lib/page-ux-fixtures";
import {
  VAULT_CHANGED_EVENT,
  VAULT_QUOTA_BYTES,
  addVaultFile,
  formatVaultSize,
  getVaultBundle,
  getVaultItem,
  removeVaultItem,
  validateVaultUploadFiles,
  type VaultItemMeta,
  type VaultUsage,
} from "@/lib/vault";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 12;

const CARD_SHADOW =
  "rounded-3xl shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border";

/** 파일 목록을 업로드 날짜별로 묶는다(최신순). */
function groupVaultByDay(
  items: VaultItemMeta[],
): { key: string; label: string; items: VaultItemMeta[] }[] {
  const dayKey = (iso: string) =>
    new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
  const todayKey = dayKey(new Date().toISOString());
  const yesterdayKey = dayKey(
    new Date(Date.now() - 86400000).toISOString(),
  );

  const labelOf = (iso: string, key: string) => {
    if (key === todayKey) return "오늘";
    if (key === yesterdayKey) return "어제";
    return new Date(iso).toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  };

  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const groups: { key: string; label: string; items: VaultItemMeta[] }[] = [];
  for (const item of sorted) {
    const key = dayKey(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({ key, label: labelOf(item.createdAt, key), items: [item] });
    }
  }
  return groups;
}

/** 유저별 스토리지 보관함 (한도 500MB). */
export default function VaultPage() {
  const { scenarioId, isLive } = usePageUxPreview();
  const pageRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<VaultItemMeta[]>([]);
  const [usage, setUsage] = useState<VaultUsage | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [previewDuplicateOpen, setPreviewDuplicateOpen] = useState(false);
  const [selectMode, setSelectMode] = useState<"download" | "delete" | null>(
    null,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { items: next, usage: nextUsage } = await getVaultBundle();
      setItems(next);
      setUsage(nextUsage);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "보관함을 불러오지 못했습니다.",
      );
    }
  }, []);

  useEffect(() => {
    void refresh();
    function onChanged() {
      void refresh();
    }
    window.addEventListener(VAULT_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(VAULT_CHANGED_EVENT, onChanged);
  }, [refresh]);

  const viewItems = useMemo(() => {
    if (scenarioId === "empty") return [];
    if (
      scenarioId === "full" ||
      scenarioId === "quota-tight" ||
      scenarioId === "quota-full" ||
      scenarioId === "upload" ||
      scenarioId === "upload-busy" ||
      scenarioId === "upload-quota" ||
      scenarioId === "popup-duplicate"
    ) {
      return fixtureVaultItemsFull();
    }
    return items;
  }, [items, scenarioId]);

  const viewUsage = useMemo(() => {
    if (scenarioId === "empty") return fixtureVaultUsage("empty");
    if (
      scenarioId === "full" ||
      scenarioId === "upload" ||
      scenarioId === "upload-busy" ||
      scenarioId === "popup-duplicate"
    ) {
      return fixtureVaultUsage("full");
    }
    if (scenarioId === "quota-tight" || scenarioId === "upload-quota") {
      return fixtureVaultUsage(scenarioId === "upload-quota" ? "maxed" : "tight");
    }
    if (scenarioId === "quota-full") return fixtureVaultUsage("maxed");
    return usage;
  }, [scenarioId, usage]);

  const quotaFull = (viewUsage?.remaining ?? 1) <= 0;
  const previewUploadBusy = scenarioId === "upload-busy";

  useEffect(() => {
    if (
      scenarioId === "upload" ||
      scenarioId === "upload-busy" ||
      scenarioId === "upload-quota"
    ) {
      setError(null);
      setUploadOpen(true);
      setPreviewDuplicateOpen(false);
      return;
    }
    if (scenarioId === "popup-duplicate") {
      setError(null);
      setUploadOpen(false);
      setPreviewDuplicateOpen(true);
      return;
    }
    setUploadOpen(false);
    setPreviewDuplicateOpen(false);
  }, [scenarioId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return viewItems;
    return viewItems.filter((item) => item.name.toLowerCase().includes(q));
  }, [viewItems, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
    setSelectMode(null);
    setSelected(new Set());
    setDeleteConfirmOpen(false);
  }, [query, scenarioId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const grouped = useMemo(() => groupVaultByDay(pageItems), [pageItems]);

  const pageNumbers = useMemo(() => {
    const maxButtons = 5;
    if (totalPages <= maxButtons) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const half = Math.floor(maxButtons / 2);
    let start = Math.max(1, currentPage - half);
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }, [currentPage, totalPages]);

  async function ingestFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const remaining = viewUsage?.remaining ?? null;
    const invalid = validateVaultUploadFiles(files, remaining);
    if (invalid) {
      setError(invalid);
      if (!uploadOpen) setUploadOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!isLive) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        setUploadOpen(false);
        return;
      }
      for (const file of files) {
        await addVaultFile(file);
      }
      await refresh();
      setUploadOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
      if (!uploadOpen) setUploadOpen(true);
    } finally {
      setBusy(false);
    }
  }

  function exitSelectMode() {
    setSelectMode(null);
    setSelected(new Set());
    setDeleteConfirmOpen(false);
  }

  function enterSelectMode(mode: "download" | "delete") {
    setSelectMode(mode);
    setSelected(new Set());
    setDeleteConfirmOpen(false);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((item) => selected.has(item.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.map((item) => item.id)));
  }

  const selectedItems = useMemo(
    () => filtered.filter((item) => selected.has(item.id)),
    [filtered, selected],
  );

  async function downloadSelectedFiles() {
    const targets = selectedItems;
    if (targets.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!isLive) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        exitSelectMode();
        return;
      }
      for (const meta of targets) {
        const item = await getVaultItem(meta.id);
        if (!item) continue;
        const url = URL.createObjectURL(item.blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = item.name;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }
      exitSelectMode();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "다운로드에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteSelectedFiles() {
    const targets = selectedItems;
    if (targets.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!isLive) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        setDeleteConfirmOpen(false);
        exitSelectMode();
        return;
      }
      for (const meta of targets) {
        await removeVaultItem(meta.id);
      }
      await refresh();
      setDeleteConfirmOpen(false);
      exitSelectMode();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadOneFile(meta: VaultItemMeta) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!isLive) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        return;
      }
      const item = await getVaultItem(meta.id);
      if (!item) return;
      const url = URL.createObjectURL(item.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = item.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "다운로드에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function shareOneFile(meta: VaultItemMeta) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!isLive) {
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        return;
      }
      const item = await getVaultItem(meta.id);
      if (!item) return;
      const file = new File([item.blob], item.name, { type: item.mime });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: item.name });
        return;
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ title: item.name, text: item.name });
        return;
      }
      await navigator.clipboard.writeText(item.name);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "공유에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function removeFile(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!isLive) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        return;
      }
      await removeVaultItem(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer soft>
      <div
        ref={pageRef}
        className="mx-auto flex w-full max-w-5xl flex-col gap-4 pb-24 sm:pb-0"
      >
        <header className="min-w-0 space-y-2.5 sm:space-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="shrink-0 text-2xl font-bold leading-none tracking-tight text-foreground">
              보관함
            </h1>
            <div className="min-w-0 flex-1 sm:hidden">
              <VaultQuotaGauge usage={viewUsage} compact />
            </div>
          </div>
          <div
            ref={chromeRef}
            className="hidden min-w-0 items-center gap-2.5 sm:flex"
          >
            <div className="min-w-0 sm:w-[15rem] sm:shrink-0">
              <VaultQuotaGauge usage={viewUsage} />
            </div>
            <VaultRoundSearch
              query={query}
              onQueryChange={setQuery}
              className="min-w-0 sm:flex-none"
            />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {selectMode ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "vault-select-actions-in h-11 cursor-pointer gap-2 rounded-full border-0 bg-card px-5 text-[15px] font-semibold shadow-soft",
                      selectMode === "delete"
                        ? "text-masked hover:bg-card hover:brightness-[0.98]"
                        : "text-foreground hover:bg-card hover:brightness-[0.98]",
                    )}
                    disabled={busy || selected.size === 0}
                    aria-label={
                      selectMode === "delete"
                        ? `삭제${selected.size > 0 ? ` ${selected.size}` : ""}`
                        : `다운로드${selected.size > 0 ? ` ${selected.size}` : ""}`
                    }
                    onClick={() => {
                      if (selectMode === "delete") {
                        setDeleteConfirmOpen(true);
                        return;
                      }
                      void downloadSelectedFiles();
                    }}
                  >
                    {selectMode === "delete" ? (
                      <Trash2
                        className="h-[1.125rem] w-[1.125rem]"
                        strokeWidth={1.75}
                      />
                    ) : (
                      <Download
                        className="h-[1.125rem] w-[1.125rem]"
                        strokeWidth={2}
                      />
                    )}
                    {selectMode === "delete" ? "삭제" : "다운로드"}
                    {selected.size > 0 ? ` ${selected.size}` : ""}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="vault-select-actions-in-delay h-11 w-11 cursor-pointer rounded-full"
                    aria-label="선택 취소"
                    disabled={busy}
                    onClick={exitSelectMode}
                  >
                    <X className="h-5 w-5" strokeWidth={1.75} />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    className="h-11 cursor-pointer gap-2 rounded-full px-5 text-[15px]"
                    disabled={busy || quotaFull}
                    aria-label="올리기"
                    onClick={() => {
                      if (quotaFull) return;
                      setError(null);
                      setUploadOpen(true);
                    }}
                  >
                    <Upload
                      className="h-[1.125rem] w-[1.125rem]"
                      strokeWidth={1.75}
                    />
                    올리기
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 cursor-pointer gap-2 rounded-full border-0 bg-card px-5 text-[15px] font-semibold text-foreground shadow-soft hover:bg-card hover:brightness-[0.98]"
                    disabled={busy || filtered.length === 0}
                    aria-label="다운로드"
                    onClick={() => enterSelectMode("download")}
                  >
                    <Download
                      className="h-[1.125rem] w-[1.125rem]"
                      strokeWidth={2}
                    />
                    다운로드
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 cursor-pointer gap-2 rounded-full border-0 bg-card px-5 text-[15px] font-semibold text-masked shadow-soft hover:bg-card hover:text-masked hover:brightness-[0.98]"
                    disabled={busy || filtered.length === 0}
                    aria-label="삭제"
                    onClick={() => enterSelectMode("delete")}
                  >
                    <Trash2
                      className="h-[1.125rem] w-[1.125rem] text-masked"
                      strokeWidth={1.75}
                    />
                    삭제
                  </Button>
                </>
              )}
            </div>
          </div>
        </header>

        <VaultMobileActionBar
          query={query}
          onQueryChange={setQuery}
          selectMode={selectMode}
          selectedCount={selected.size}
          busy={busy}
          quotaFull={quotaFull}
          hasFiles={filtered.length > 0}
          onUpload={() => {
            if (quotaFull) return;
            setError(null);
            setUploadOpen(true);
          }}
          onEnterDownload={() => enterSelectMode("download")}
          onEnterDelete={() => enterSelectMode("delete")}
          onConfirmSelection={() => {
            if (selectMode === "delete") {
              setDeleteConfirmOpen(true);
              return;
            }
            void downloadSelectedFiles();
          }}
          onExitSelect={exitSelectMode}
        />

        {quotaFull ? (
          <p className="text-sm font-medium text-red-600" role="status">
            보관함 용량이 가득 찼습니다. 파일을 비운 뒤 다시 올려 주세요.
          </p>
        ) : null}

        <VaultFloatSearch
          chromeRef={chromeRef}
          pageRef={pageRef}
          query={query}
          onQueryChange={setQuery}
        />

        <VaultUploadDialog
          open={uploadOpen}
          usage={viewUsage}
          busy={busy || previewUploadBusy}
          error={error}
          onClose={() => {
            if (busy && scenarioId === "live") return;
            if (scenarioId === "upload" || scenarioId === "upload-busy" || scenarioId === "upload-quota") return;
            setError(null);
            setUploadOpen(false);
          }}
          onUpload={ingestFiles}
        />

        <DuplicateVaultNameDialog
          open={previewDuplicateOpen || scenarioId === "popup-duplicate"}
          originalName="주간회의.m4a"
          nextName="주간회의 (1).m4a"
          onCancel={() => {
            if (scenarioId === "popup-duplicate") return;
            setPreviewDuplicateOpen(false);
          }}
          onConfirm={() => {
            if (scenarioId === "popup-duplicate") return;
            setPreviewDuplicateOpen(false);
          }}
        />

        <VaultDeleteConfirmDialog
          open={deleteConfirmOpen}
          items={selectedItems}
          busy={busy}
          onCancel={() => {
            if (busy && isLive) return;
            setDeleteConfirmOpen(false);
          }}
          onConfirm={() => {
            void confirmDeleteSelectedFiles();
          }}
        />

        {error && !uploadOpen ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <section
          aria-labelledby="vault-list-heading"
          onDragOver={(event) => {
            event.preventDefault();
            if (!quotaFull) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (quotaFull || busy) return;
            void ingestFiles(event.dataTransfer.files);
          }}
          className={cn(
            "flex min-h-[36rem] flex-col overflow-hidden bg-card transition-[box-shadow,background-color] sm:min-h-[42rem]",
            CARD_SHADOW,
            dragOver && !quotaFull && "bg-primary-soft ring-2 ring-primary",
          )}
        >
          <div className="shrink-0 space-y-0 px-4 pb-0 pt-5 sm:px-6 sm:pt-6">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {selectMode ? (
                <button
                  type="button"
                  className={cn(
                    "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md border-2",
                    allFilteredSelected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border-strong bg-card",
                  )}
                  aria-label={
                    allFilteredSelected ? "전체 선택 해제" : "전체 선택"
                  }
                  aria-pressed={allFilteredSelected}
                  disabled={busy || filtered.length === 0}
                  onClick={toggleSelectAll}
                >
                  {allFilteredSelected ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                  ) : null}
                </button>
              ) : null}
              <h2
                id="vault-list-heading"
                className="min-w-0 flex-1 truncate text-xl font-bold tracking-tight text-foreground"
              >
                {selectMode === "download"
                  ? "받을 파일 선택"
                  : selectMode === "delete"
                    ? "삭제할 파일 선택"
                    : "보관 파일"}
              </h2>
              <span className="shrink-0 text-base font-medium tabular-nums text-muted">
                {filtered.length}
                {query.trim() && filtered.length !== viewItems.length
                  ? ` / ${viewItems.length}`
                  : null}
              </span>
              {dragOver ? (
                <p className="shrink-0 text-base tabular-nums text-muted-2">
                  여기에 놓기
                </p>
              ) : null}
            </div>
            <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
            {viewItems.length > 0 && !dragOver ? (
              <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-border px-0 sm:gap-3">
                {selectMode ? (
                  <span className="w-6 shrink-0" aria-hidden />
                ) : null}
                <span className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" aria-hidden />
                <span className="min-w-0 flex-1 text-base font-medium text-muted">
                  이름
                </span>
                <div className="flex shrink-0 items-center gap-3 sm:gap-5">
                  <span className="hidden w-[4.5rem] text-center text-base font-medium text-muted sm:block">
                    수정시간
                  </span>
                  <span className="w-[3.75rem] text-center text-base font-medium text-muted sm:w-[4.5rem]">
                    용량
                  </span>
                  <span className="w-10 shrink-0" aria-hidden />
                </div>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {viewItems.length === 0 ? (
              <div className="flex h-full min-h-0 items-center justify-center px-4 py-10">
                <div className="flex items-center gap-3 text-muted">
                  <Inbox
                    className="h-6 w-6 shrink-0"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <p className="text-base leading-5">올린 파일이 없습니다.</p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-6 text-base leading-5 text-muted sm:px-6">
                검색 결과가 없습니다.
              </p>
            ) : (
              grouped.map((group) => (
                <div key={group.key}>
                  <p className="sticky top-0 z-10 bg-card px-4 pb-1.5 pt-3 text-base font-semibold tracking-wide text-muted sm:px-6">
                    {group.label}
                  </p>
                  <ul className="divide-y divide-border">
                    {group.items.map((item) => (
                      <VaultListItem
                        key={item.id}
                        item={item}
                        busy={busy}
                        selecting={Boolean(selectMode)}
                        checked={selected.has(item.id)}
                        onToggle={() => toggleSelected(item.id)}
                        onDownload={() => {
                          void downloadOneFile(item);
                        }}
                        onShare={() => {
                          void shareOneFile(item);
                        }}
                        onRemove={() => {
                          if (!window.confirm(`${item.name}을(를) 삭제할까요?`)) {
                            return;
                          }
                          void removeFile(item.id);
                        }}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>

          <nav
            className="flex shrink-0 items-center justify-center gap-1 px-2 py-2.5"
            aria-label="보관 파일 페이지"
          >
            <button
              type="button"
              aria-label="이전 페이지"
              disabled={currentPage <= 1 || filtered.length === 0}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                currentPage <= 1 || filtered.length === 0
                  ? "cursor-default text-muted-2"
                  : "cursor-pointer text-foreground hover:bg-surface",
              )}
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
            </button>
            {pageNumbers.map((num) => {
              const active = num === currentPage && filtered.length > 0;
              return (
                <button
                  type="button"
                  key={num}
                  aria-label={`${num}페이지`}
                  aria-current={active ? "page" : undefined}
                  disabled={filtered.length === 0}
                  onClick={() => setPage(num)}
                  className={cn(
                    "inline-flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-base tabular-nums transition-colors",
                    filtered.length === 0
                      ? "cursor-default font-medium text-muted-2"
                      : active
                        ? "cursor-default font-bold text-foreground"
                        : "cursor-pointer font-semibold text-foreground/75 hover:bg-surface hover:text-foreground",
                  )}
                >
                  {num}
                </button>
              );
            })}
            <button
              type="button"
              aria-label="다음 페이지"
              disabled={currentPage >= totalPages || filtered.length === 0}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                currentPage >= totalPages || filtered.length === 0
                  ? "cursor-default text-muted-2"
                  : "cursor-pointer text-foreground hover:bg-surface",
              )}
            >
              <ChevronRight className="h-5 w-5" strokeWidth={2.25} />
            </button>
          </nav>
        </section>
      </div>
    </PageContainer>
  );
}

/** 타이틀 옆 용량 게이지. 사용량 / 한도. */
function VaultQuotaGauge({
  usage,
  compact = false,
}: {
  usage: VaultUsage | null;
  compact?: boolean;
}) {
  const quota = usage?.quota ?? VAULT_QUOTA_BYTES;
  const used = usage?.used ?? 0;
  const ratio = quota > 0 ? Math.min(1, used / quota) : 0;
  const pct = Math.round(ratio * 1000) / 10;
  const barPct = Math.max(2, Math.round(ratio * 100));
  const tight = ratio >= 0.9;

  return (
    <div
      className={cn(
        "flex h-11 w-full min-w-0 items-center gap-2 rounded-full bg-card ring-1 ring-border",
        "shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)]",
        compact ? "px-3" : "gap-2.5 px-3.5 sm:px-4",
      )}
      title={`${pct}% 사용`}
    >
      <div
        className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-label={`저장 공간 ${formatVaultSize(used)} / ${formatVaultSize(quota)}`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color]",
            tight ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${barPct}%` }}
        />
      </div>
      <p
        className={cn(
          "shrink-0 whitespace-nowrap text-base font-semibold tabular-nums",
          compact && "text-sm",
          tight ? "text-warning" : "text-foreground",
        )}
      >
        {formatVaultSize(used)} / {formatVaultSize(quota)}
      </p>
    </div>
  );
}

/** 아이콘 | 이름 | 수정시간 | 용량 | 메뉴 — 한 줄. 일자 그룹 헤더가 있으므로 시각만. */
function formatVaultModifiedTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function VaultItemMoreMenu({
  fileName,
  busy,
  onDownload,
  onShare,
  onRemove,
}: {
  fileName: string;
  busy: boolean;
  onDownload: () => void;
  onShare: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open) return;
    const button = rootRef.current?.querySelector("button");
    if (button) {
      const rect = button.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const menu =
    open && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={menuRef}
            role="menu"
            style={{ top: pos.top, right: pos.right }}
            className="vault-menu-in fixed z-[80] min-w-[9.5rem] overflow-hidden rounded-xl bg-card py-1 shadow-[0_12px_28px_rgba(17,24,46,0.12)]"
          >
            <li>
              <button
                type="button"
                role="menuitem"
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-base font-medium text-masked transition-colors hover:bg-masked-soft"
                onClick={() => {
                  setOpen(false);
                  onRemove();
                }}
              >
                <Trash2 className="h-4 w-4 text-masked" strokeWidth={1.75} />
                삭제
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-base font-medium text-foreground transition-colors hover:bg-surface"
                onClick={() => {
                  setOpen(false);
                  onDownload();
                }}
              >
                <Download className="h-4 w-4" strokeWidth={1.75} />
                다운로드
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-base font-medium text-foreground transition-colors hover:bg-surface"
                onClick={() => {
                  setOpen(false);
                  onShare();
                }}
              >
                <Share2 className="h-4 w-4" strokeWidth={1.75} />
                공유
              </button>
            </li>
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 cursor-pointer rounded-full text-muted hover:bg-surface-2 hover:text-foreground"
        aria-label={`${fileName} 더보기`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
      </Button>
      {menu}
    </div>
  );
}

function VaultListItem({
  item,
  busy,
  selecting,
  checked,
  onToggle,
  onDownload,
  onShare,
  onRemove,
}: {
  item: VaultItemMeta;
  busy: boolean;
  selecting: boolean;
  checked: boolean;
  onToggle: () => void;
  onDownload: () => void;
  onShare: () => void;
  onRemove: () => void;
}) {
  return (
    <li
      className={cn(
        "flex min-h-14 min-w-0 items-center gap-2.5 px-4 py-3.5 transition-colors sm:gap-3 sm:px-6",
        selecting && "cursor-pointer",
        selecting && checked
          ? "bg-primary/15"
          : "hover:bg-surface/70",
      )}
      onClick={
        selecting && !busy
          ? () => {
              onToggle();
            }
          : undefined
      }
      onKeyDown={
        selecting && !busy
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onToggle();
              }
            }
          : undefined
      }
      role={selecting ? "button" : undefined}
      tabIndex={selecting ? 0 : undefined}
      aria-pressed={selecting ? checked : undefined}
      aria-label={
        selecting
          ? `${item.name} ${checked ? "선택 해제" : "선택"}`
          : undefined
      }
    >
      {selecting ? (
        <span
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border-strong bg-card",
          )}
          aria-hidden
        >
          {checked ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
        </span>
      ) : null}
      <VaultFileIcon
        name={item.name}
        mime={item.mime}
        size={20}
        className="h-9 w-9 sm:h-10 sm:w-10"
      />
      <p
        className={cn(
          "min-w-0 flex-1 overflow-hidden truncate text-base font-semibold leading-6 sm:text-lg",
          selecting && checked ? "text-primary" : "text-foreground",
        )}
      >
        {item.name}
      </p>
      <div className="flex shrink-0 items-center gap-3 sm:gap-5">
        <span className="hidden w-[4.5rem] text-center text-base tabular-nums text-muted sm:block">
          {formatVaultModifiedTime(item.createdAt)}
        </span>
        <span className="w-[3.75rem] text-center text-base tabular-nums text-muted sm:w-[4.5rem]">
          {formatVaultSize(item.size)}
        </span>
        {selecting ? (
          <span className="w-10 shrink-0" aria-hidden />
        ) : (
          <VaultItemMoreMenu
            fileName={item.name}
            busy={busy}
            onDownload={onDownload}
            onShare={onShare}
            onRemove={onRemove}
          />
        )}
      </div>
    </li>
  );
}
