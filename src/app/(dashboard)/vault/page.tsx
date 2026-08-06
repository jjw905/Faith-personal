"use client";

import {
  Check,
  Download,
  Inbox,
  MoreHorizontal,
  Plus,
  Share2,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { UsageLimitDialog } from "@/components/dashboard/usage-limit-dialog";
import {
  RecordsPageNav,
  recordsPageSize,
} from "@/components/dashboard/records-page-nav";
import { ExpandableMeetingSearch } from "@/components/dashboard/meeting-search";
import { PageContainer } from "@/components/layout/page-container";
import { useMdUp } from "@/hooks/use-md-up";
import { MeetingRecordHeaderRow } from "@/components/meetings/meeting-record-layout";
import { Button } from "@/components/ui/button";
import { VaultFileIcon } from "@/components/vault/vault-file-icon";
import {
  VaultActionConfirmDialog,
  type VaultConfirmAction,
} from "@/components/vault/vault-action-confirm-dialog";
import { VaultMobileActionBar } from "@/components/vault/vault-mobile-action-bar";
import { VaultUploadDialog } from "@/components/vault/vault-upload-dialog";
import { DuplicateVaultNameDialog } from "@/components/vault/duplicate-name-dialog";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  fixtureVaultItemsFull,
  fixtureVaultUsage,
} from "@/lib/page-ux-fixtures";
import { TOUCH_GROUP, TOUCH_ICON_BUTTON } from "@/lib/touch-target";
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

function useIsMdUp() {
  return useMdUp();
}

function vaultDayKey(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

function vaultDayLabel(iso: string, key: string) {
  const todayKey = vaultDayKey(new Date().toISOString());
  const yesterdayKey = vaultDayKey(
    new Date(Date.now() - 86400000).toISOString(),
  );
  if (key === todayKey) return "오늘";
  if (key === yesterdayKey) return "어제";
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

/** 파일 목록을 업로드 날짜별로 묶는다(최신순). */
function groupVaultByDay(
  items: VaultItemMeta[],
): { key: string; label: string; items: VaultItemMeta[] }[] {
  const sorted = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  const groups: { key: string; label: string; items: VaultItemMeta[] }[] = [];
  for (const item of sorted) {
    const key = vaultDayKey(item.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      groups.push({
        key,
        label: vaultDayLabel(item.createdAt, key),
        items: [item],
      });
    }
  }
  return groups;
}

/** 유저별 스토리지 보관함 (한도 500MB). 대시보드와 같은 흰 프레임·리스트 패턴. */
export default function VaultPage() {
  const { scenarioId, isLive } = usePageUxPreview();
  const isMdUp = useIsMdUp();
  const pageSize = recordsPageSize(isMdUp);
  const [items, setItems] = useState<VaultItemMeta[]>([]);
  const [usage, setUsage] = useState<VaultUsage | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [previewDuplicateOpen, setPreviewDuplicateOpen] = useState(false);
  const [selectMode, setSelectMode] = useState<"download" | "delete" | null>(
    null,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** 다운로드, 공유, 삭제는 실행 전 확인을 거친다. */
  const [confirmAsk, setConfirmAsk] = useState<{
    action: VaultConfirmAction;
    items: VaultItemMeta[];
  } | null>(null);

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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
    setSelectMode(null);
    setSelected(new Set());
    setConfirmAsk(null);
  }, [query, scenarioId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const grouped = useMemo(() => groupVaultByDay(pageItems), [pageItems]);

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
    setConfirmAsk(null);
  }

  function enterSelectMode(mode: "download" | "delete") {
    setSelectMode(mode);
    setSelected(new Set());
    setConfirmAsk(null);
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

  /** 확인 팝업을 띄운다. 실행은 팝업의 확인 버튼에서만 일어난다. */
  function askConfirm(action: VaultConfirmAction, targets: VaultItemMeta[]) {
    if (targets.length === 0 || busy) return;
    setError(null);
    setConfirmAsk({ action, items: targets });
  }

  async function runDownload(targets: VaultItemMeta[]) {
    if (!isLive) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
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
  }

  async function runDelete(targets: VaultItemMeta[]) {
    if (!isLive) {
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      return;
    }
    for (const meta of targets) {
      await removeVaultItem(meta.id);
    }
    await refresh();
  }

  async function runShare(targets: VaultItemMeta[]) {
    if (!isLive) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      return;
    }
    const metas = targets.slice(0, 10);
    const files: File[] = [];
    for (const meta of metas) {
      const item = await getVaultItem(meta.id);
      if (!item) continue;
      files.push(new File([item.blob], item.name, { type: item.mime }));
    }
    if (files.length === 0) return;

    const title = files.length === 1 ? files[0].name : `파일 ${files.length}개`;
    if (typeof navigator.canShare === "function" && navigator.canShare({ files })) {
      await navigator.share({ files, title });
      return;
    }
    if (typeof navigator.share === "function") {
      await navigator.share({ title, text: title });
      return;
    }
    await navigator.clipboard.writeText(files.map((file) => file.name).join("\n"));
  }

  async function runConfirmedAction() {
    if (!confirmAsk || busy) return;
    const { action, items: targets } = confirmAsk;
    setBusy(true);
    setError(null);
    try {
      if (action === "download") await runDownload(targets);
      else if (action === "delete") await runDelete(targets);
      else await runShare(targets);
      setConfirmAsk(null);
      if (selectMode) exitSelectMode();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setConfirmAsk(null);
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : action === "delete"
            ? "삭제에 실패했습니다."
            : action === "download"
              ? "다운로드에 실패했습니다."
              : "공유에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  const uploadButtonClass =
    "inline-flex h-14 cursor-pointer items-center gap-2 rounded-[50px] bg-primary px-5 text-base font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-primary-hover disabled:pointer-events-none disabled:opacity-50";

  function openUpload() {
    if (quotaFull) {
      setUsageDialogOpen(true);
      return;
    }
    setError(null);
    setUploadOpen(true);
  }

  const batchActions = (
    <div className={cn(TOUCH_GROUP, "shrink-0")}>
      {selectMode ? (
        <>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              TOUCH_ICON_BUTTON,
              "min-w-0 cursor-pointer px-3 text-base font-semibold md:h-9 md:min-h-9 md:min-w-0 md:px-2.5 md:text-xs",
            )}
            onClick={toggleSelectAll}
            disabled={filtered.length === 0 || busy}
          >
            {allFilteredSelected ? "선택 해제" : "전체"}
          </Button>
          <Button
            type="button"
            className={cn(
              "h-12 min-w-12 cursor-pointer gap-1.5 px-3 text-base md:h-9 md:min-w-0 md:px-3 md:text-sm",
              selectMode === "delete" &&
                "bg-foreground text-background hover:bg-foreground/90",
            )}
            disabled={selected.size === 0 || busy}
            onClick={() =>
              askConfirm(
                selectMode === "delete" ? "delete" : "download",
                selectedItems,
              )
            }
          >
            {selectMode === "delete" ? (
              <Trash2 className="h-5 w-5 md:h-4 md:w-4" strokeWidth={1.75} />
            ) : (
              <Download className="h-5 w-5 md:h-4 md:w-4" strokeWidth={1.75} />
            )}
            <span className="tabular-nums">{selected.size}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(TOUCH_ICON_BUTTON, "cursor-pointer")}
            aria-label="선택 취소"
            disabled={busy}
            onClick={exitSelectMode}
          >
            <X strokeWidth={1.75} />
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              TOUCH_ICON_BUTTON,
              "cursor-pointer text-muted hover:bg-surface/70 hover:text-foreground",
            )}
            aria-label="다운로드"
            disabled={filtered.length === 0}
            onClick={() => enterSelectMode("download")}
          >
            <Download strokeWidth={1.75} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              TOUCH_ICON_BUTTON,
              "cursor-pointer text-muted hover:bg-surface/70 hover:text-foreground",
            )}
            aria-label="삭제"
            disabled={filtered.length === 0}
            onClick={() => enterSelectMode("delete")}
          >
            <Trash2 strokeWidth={1.75} />
          </Button>
        </>
      )}
    </div>
  );

  const listHeading =
    selectMode === "download"
      ? "받을 파일 선택"
      : selectMode === "delete"
        ? "삭제할 파일 선택"
        : "보관 파일";

  return (
    <PageContainer soft>
      <div className="flex flex-col gap-8 pb-[calc(env(safe-area-inset-bottom,0px)+6.25rem)] md:pb-0">
        <div className="min-w-0">
          <MeetingRecordHeaderRow
            leading={
              <span
                className={cn(
                  uploadButtonClass,
                  "pointer-events-none invisible hidden md:inline-flex",
                )}
                aria-hidden
              >
                <Plus className="h-5 w-5 shrink-0" strokeWidth={2.25} />
                올리기
              </span>
            }
            center={
              <h1 className="flex min-h-14 max-w-full items-center justify-center truncate text-center text-2xl font-bold leading-none tracking-tight text-foreground">
                보관함
              </h1>
            }
            trailing={
              <button
                type="button"
                onClick={openUpload}
                disabled={busy}
                className={cn(uploadButtonClass, "hidden md:inline-flex")}
                aria-label="올리기"
                title="올리기"
              >
                <Upload
                  className="h-5 w-5 shrink-0"
                  strokeWidth={2.25}
                  aria-hidden
                />
                올리기
              </button>
            }
          />
          <div className="mt-3 flex justify-center md:mt-2">
            <VaultQuotaMeta
              usage={viewUsage}
              onOpen={() => setUsageDialogOpen(true)}
            />
          </div>
        </div>

        <VaultMobileActionBar
          query={query}
          onQueryChange={setQuery}
          selectMode={selectMode}
          selectedCount={selected.size}
          busy={busy}
          quotaFull={quotaFull}
          onUpload={openUpload}
          onConfirmSelection={() => {
            askConfirm(
              selectMode === "delete" ? "delete" : "download",
              selectedItems,
            );
          }}
          onExitSelect={exitSelectMode}
        />

        {quotaFull ? (
          <button
            type="button"
            role="status"
            onClick={() => setUsageDialogOpen(true)}
            className="cursor-pointer text-left text-base font-medium text-red-600 underline-offset-2 hover:underline"
          >
            보관함 용량이 가득 찼습니다. 자세히 보기
          </button>
        ) : null}

        <VaultUploadDialog
          open={uploadOpen}
          usage={viewUsage}
          busy={busy || previewUploadBusy}
          error={error}
          onClose={() => {
            if (busy && scenarioId === "live") return;
            if (
              scenarioId === "upload" ||
              scenarioId === "upload-busy" ||
              scenarioId === "upload-quota"
            ) {
              return;
            }
            setError(null);
            setUploadOpen(false);
          }}
          onUpload={ingestFiles}
          onQuotaFull={() => {
            setUploadOpen(false);
            setUsageDialogOpen(true);
          }}
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

        <VaultActionConfirmDialog
          open={Boolean(confirmAsk)}
          action={confirmAsk?.action ?? "download"}
          items={confirmAsk?.items ?? []}
          busy={busy}
          onCancel={() => {
            if (busy && isLive) return;
            setConfirmAsk(null);
          }}
          onConfirm={() => {
            void runConfirmedAction();
          }}
        />

        <UsageLimitDialog
          open={usageDialogOpen}
          variant="storage"
          storageStatus={viewUsage}
          onClose={() => setUsageDialogOpen(false)}
        />

        {error && !uploadOpen ? (
          <p className="text-base text-red-600" role="alert">
            {error}
          </p>
        ) : null}

        <section
          aria-label={listHeading}
          onDragOver={(event) => {
            event.preventDefault();
            if (!quotaFull) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (busy) return;
            if (quotaFull) {
              setUsageDialogOpen(true);
              return;
            }
            void ingestFiles(event.dataTransfer.files);
          }}
          className={cn(
            "min-w-0 outline-none transition-colors",
            dragOver && !quotaFull && "rounded-2xl bg-primary-soft/60",
          )}
        >
          <div className="mb-3 min-w-0">
            {/* 모바일: 하단 엄지 존 검색만 — 상단 검색 토글 숨김 (중복 금지) */}
            <div className="md:hidden">
              <ExpandableMeetingSearch
                value={query}
                onChange={setQuery}
                placeholder="파일 검색"
                label="파일 검색"
                showSearchToggle={false}
                toolbar={
                  <div className="flex min-h-12 min-w-0 items-end gap-2">
                    <h2 className="min-w-0 flex-1 truncate pb-2.5 text-xl font-bold tracking-tight text-foreground">
                      {listHeading}
                    </h2>
                    <span className="shrink-0 pb-2.5 text-base font-medium tabular-nums text-muted">
                      {filtered.length}
                      {query.trim() && filtered.length !== viewItems.length
                        ? ` / ${viewItems.length}`
                        : null}
                    </span>
                  </div>
                }
              />
              <div className="flex items-center justify-end pt-2">
                {batchActions}
              </div>
              {query.trim() ? (
                <p className="pt-2 text-base text-muted">
                  “{query.trim()}” 검색 결과
                </p>
              ) : null}
            </div>

            <div className="hidden md:block">
              <ExpandableMeetingSearch
                value={query}
                onChange={setQuery}
                placeholder="파일 검색"
                label="파일 검색"
                toolbar={
                  <div className="flex min-h-12 min-w-0 items-end gap-2">
                    <h2 className="min-w-0 flex-1 truncate pb-2.5 text-xl font-bold tracking-tight text-foreground">
                      {listHeading}
                    </h2>
                    {dragOver ? (
                      <p className="shrink-0 pb-2.5 text-base text-muted-2">
                        여기에 놓기
                      </p>
                    ) : (
                      <span className="shrink-0 pb-2.5 text-base font-medium tabular-nums text-muted">
                        {filtered.length}
                        {query.trim() && filtered.length !== viewItems.length
                          ? ` / ${viewItems.length}`
                          : null}
                      </span>
                    )}
                  </div>
                }
              />
            </div>
          </div>

          <div className="hidden flex-col gap-2 md:grid md:min-h-9 md:grid-cols-[11.5rem_minmax(0,1fr)_11.5rem] md:items-center md:gap-1.5">
            <div aria-hidden />
            <div aria-hidden />
            <div className="flex items-center justify-end">{batchActions}</div>
          </div>

          {viewItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <Inbox
                className="h-12 w-12 text-muted-2"
                strokeWidth={1.5}
                aria-hidden
              />
              <p className="text-base text-muted">올린 파일이 없습니다.</p>
              <Button
                type="button"
                className="min-h-14 w-full max-w-xs cursor-pointer rounded-2xl px-6 text-lg font-semibold md:min-h-11 md:w-auto md:text-base [&_svg]:size-5"
                disabled={busy}
                onClick={openUpload}
              >
                <Upload strokeWidth={2} />
                올리기
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-base text-muted">
              검색 결과가 없습니다.
            </p>
          ) : (
            <>
              <div>
                {grouped.map((group) => {
                  const visibleCount = group.items.length;
                  return (
                    <div key={group.key}>
                      <p className="flex items-baseline justify-between gap-3 px-0 pb-2 pt-5 first:pt-3">
                        <span className="text-base font-semibold tracking-tight text-muted">
                          {group.label}
                        </span>
                        {visibleCount > 1 ? (
                          <span className="shrink-0 text-base font-medium tabular-nums text-muted-2">
                            {visibleCount}개
                          </span>
                        ) : null}
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
                            onDownload={() => askConfirm("download", [item])}
                            onShare={() => askConfirm("share", [item])}
                            onRemove={() => askConfirm("delete", [item])}
                          />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
              <RecordsPageNav
                page={currentPage}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

/** 용량 메타 — 카드/섹션 배경 없음. 대시보드 supporting meta와 동일 밴드. */
function VaultQuotaMeta({
  usage,
  onOpen,
}: {
  usage: VaultUsage | null;
  onOpen: () => void;
}) {
  const quota = usage?.quota ?? VAULT_QUOTA_BYTES;
  const used = usage?.used ?? 0;
  const ratio = quota > 0 ? Math.min(1, used / quota) : 0;
  const tight = ratio >= 0.9;
  const barPct = Math.min(100, Math.max(0, (used / Math.max(quota, 1)) * 100));

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${formatVaultSize(used)} / ${formatVaultSize(quota)}`}
      className="group flex w-full max-w-sm cursor-pointer flex-col items-center gap-1.5 bg-transparent px-2"
    >
      <p
        className={cn(
          "text-base font-medium tabular-nums leading-none",
          tight ? "text-warning" : "text-muted",
        )}
      >
        {formatVaultSize(used)}
        <span className="mx-1 text-muted-2">/</span>
        {formatVaultSize(quota)}
      </p>
      <div
        className="h-1 w-full max-w-[12rem] overflow-hidden rounded-full bg-border/70"
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
    </button>
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

/** 3항목 + 구분선 높이. 하단 추적 바(약 5rem) 위로 뒤집을 여유까지 확보. */
const MORE_MENU_HEIGHT = 168;
const MORE_MENU_SAFE_GAP = 96;

const MORE_MENU_ITEM_CLASS =
  "flex min-h-12 w-full cursor-pointer items-center gap-3 px-4 text-left text-base font-semibold transition-colors md:min-h-11 md:px-3.5";

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
      /** 아래 공간이 부족하면 트리거 위로 뒤집어 하단 바에 가리지 않게 한다. */
      const menuHeight = MORE_MENU_HEIGHT;
      const bottomRoom = window.innerHeight - rect.bottom - MORE_MENU_SAFE_GAP;
      setPos({
        top:
          bottomRoom < menuHeight
            ? Math.max(8, rect.top - menuHeight - 4)
            : rect.bottom + 4,
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
            className="vault-menu-in fixed z-[80] min-w-[11rem] overflow-hidden rounded-2xl bg-card py-1.5 shadow-[0_12px_28px_rgba(17,24,46,0.12)] ring-1 ring-border"
          >
            <li>
              <button
                type="button"
                role="menuitem"
                className={cn(MORE_MENU_ITEM_CLASS, "text-foreground hover:bg-surface")}
                onClick={() => {
                  setOpen(false);
                  onDownload();
                }}
              >
                <Download className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                다운로드
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                className={cn(MORE_MENU_ITEM_CLASS, "text-foreground hover:bg-surface")}
                onClick={() => {
                  setOpen(false);
                  onShare();
                }}
              >
                <Share2 className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                공유
              </button>
            </li>
            {/* 삭제는 안전한 항목과 붙지 않게 구분선 뒤 마지막에 둔다. */}
            <li className="my-1.5 h-px bg-border" role="separator" />
            <li>
              <button
                type="button"
                role="menuitem"
                className={cn(MORE_MENU_ITEM_CLASS, "text-foreground hover:bg-surface/70")}
                onClick={() => {
                  setOpen(false);
                  onRemove();
                }}
              >
                <Trash2 className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                삭제
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
        className="h-12 w-12 cursor-pointer rounded-full text-muted hover:bg-surface-2 hover:text-foreground md:h-10 md:w-10"
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
  const timeLabel = formatVaultModifiedTime(item.createdAt);
  const sizeLabel = formatVaultSize(item.size);

  return (
    <li
      className={cn(
        "group relative flex min-h-[5.5rem] items-center gap-3 py-6 transition-colors hover:bg-surface/70 sm:min-h-[6.25rem] sm:gap-4 sm:py-8",
        selecting && "cursor-pointer",
        selecting && checked && "bg-primary-soft/40",
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
            "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border-strong bg-card",
          )}
          aria-hidden
        >
          {checked ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
        </span>
      ) : null}

      <div className="relative z-10 w-[4.75rem] shrink-0 sm:w-[5.25rem]">
        <p className="text-lg tabular-nums leading-6 tracking-tight text-foreground">
          {timeLabel}
        </p>
      </div>

      <VaultFileIcon
        name={item.name}
        mime={item.mime}
        size={22}
        className="relative z-10 h-11 w-11 shrink-0 self-center rounded-full border border-border bg-transparent sm:h-12 sm:w-12"
      />

      <div className="relative z-10 min-w-0 flex-1">
        <p
          className={cn(
            "min-w-0 truncate text-lg font-semibold leading-none tracking-tight",
            selecting && checked
              ? "text-primary"
              : "text-foreground group-hover:text-primary",
          )}
          title={item.name}
        >
          {item.name}
        </p>
        <p className="mt-2 truncate text-base text-muted">{sizeLabel}</p>
      </div>

      {selecting ? (
        <span className="w-12 shrink-0 md:w-10" aria-hidden />
      ) : (
        <div className="relative z-10 shrink-0">
          <VaultItemMoreMenu
            fileName={item.name}
            busy={busy}
            onDownload={onDownload}
            onShare={onShare}
            onRemove={onRemove}
          />
        </div>
      )}
    </li>
  );
}
