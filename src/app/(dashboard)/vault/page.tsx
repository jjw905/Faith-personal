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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { VaultFileIcon } from "@/components/vault/vault-file-icon";
import {
  VaultActionConfirmDialog,
  type VaultConfirmAction,
} from "@/components/vault/vault-action-confirm-dialog";
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

/** Desktop: one page + pager fits without inner list scroll. Mobile: fewer taller rows. */
const PAGE_SIZE_DESKTOP = 8;
const PAGE_SIZE_MOBILE = 5;

/**
 * List body floor ≈ full page so short lists do not shrink the card.
 * Mobile 2-line rows (~4.75rem) + date header. Desktop 1-line denser.
 */
const LIST_BODY_MIN_CLASS =
  "min-h-[calc(5*4.75rem+2.5rem)] sm:min-h-[calc(5*4.75rem+2.5rem)] md:min-h-[calc(8*4.25rem+2.5rem)]";

function useIsNarrowMobile() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

const CARD_SHADOW =
  "rounded-3xl shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border";

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

/** 유저별 스토리지 보관함 (한도 500MB). */
export default function VaultPage() {
  const { scenarioId, isLive } = usePageUxPreview();
  const isMobile = useIsNarrowMobile();
  const pageSize = isMobile ? PAGE_SIZE_MOBILE : PAGE_SIZE_DESKTOP;
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

  return (
    <PageContainer soft className="min-h-0">
      <div
        ref={pageRef}
        className="mx-auto flex w-full max-w-5xl flex-col gap-2 pb-[calc(env(safe-area-inset-bottom,0px)+6.25rem)] md:gap-3 md:pb-0"
      >
        <header className="relative z-20 flex min-w-0 shrink-0 flex-col gap-1.5 md:gap-2.5">
          <h1 className="shrink-0 text-2xl font-bold leading-none tracking-tight text-foreground">
            보관함
          </h1>
          <div className="min-w-0 md:hidden">
            <VaultQuotaGauge usage={viewUsage} />
          </div>
          <div
            ref={chromeRef}
            className="hidden min-w-0 items-center gap-2.5 md:flex"
          >
            <div className="min-w-0 flex-1 md:max-w-md md:flex-none md:w-[20rem]">
              <VaultQuotaGauge usage={viewUsage} />
            </div>
            <VaultRoundSearch
              query={query}
              onQueryChange={setQuery}
              className="min-w-0 md:flex-none"
            />
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {selectMode ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "vault-select-actions-in h-11 cursor-pointer gap-2 rounded-full border border-border bg-card px-5 text-[15px] font-semibold",
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
                      askConfirm(
                        selectMode === "delete" ? "delete" : "download",
                        selectedItems,
                      );
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
                    className="h-11 cursor-pointer gap-2 rounded-full border border-border bg-card px-5 text-[15px] font-semibold text-foreground hover:bg-card hover:brightness-[0.98]"
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
                    className="h-11 cursor-pointer gap-2 rounded-full border border-border bg-card px-5 text-[15px] font-semibold text-masked hover:bg-card hover:text-masked hover:brightness-[0.98]"
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
            askConfirm(
              selectMode === "delete" ? "delete" : "download",
              selectedItems,
            );
          }}
          onExitSelect={exitSelectMode}
        />

        {quotaFull ? (
          <p className="text-base font-medium text-red-600" role="status">
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

        {error && !uploadOpen ? (
          <p className="text-base text-red-600" role="alert">
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
            "flex min-h-[16rem] flex-col bg-card transition-[box-shadow,background-color]",
            CARD_SHADOW,
            dragOver && !quotaFull && "bg-primary-soft ring-2 ring-primary",
          )}
        >
          <div className="space-y-0 px-4 pb-0 pt-3 sm:px-6 sm:pt-5">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {selectMode ? (
                <button
                  type="button"
                  className="-my-2 -ml-2 flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center rounded-full md:m-0 md:min-h-0 md:min-w-0 md:h-6 md:w-6"
                  aria-label={
                    allFilteredSelected ? "전체 선택 해제" : "전체 선택"
                  }
                  aria-pressed={allFilteredSelected}
                  disabled={busy || filtered.length === 0}
                  onClick={toggleSelectAll}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-md border-2",
                      allFilteredSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border-strong bg-card",
                    )}
                    aria-hidden
                  >
                    {allFilteredSelected ? (
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                    ) : null}
                  </span>
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
            <div className="mt-2 h-0.5 w-full bg-foreground sm:mt-2.5" aria-hidden />
            {/* 데스크톱만 컬럼 헤더. 모바일은 M3 2줄 리스트로 표 느낌 제거. */}
            {viewItems.length > 0 && !dragOver ? (
              <div className="hidden h-11 shrink-0 items-center gap-3 border-b border-border px-0 sm:flex">
                {selectMode ? (
                  <span className="w-6 shrink-0" aria-hidden />
                ) : null}
                <span className="h-10 w-10 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 text-base font-medium text-muted">
                  이름
                </span>
                <div className="flex shrink-0 items-center gap-5">
                  <span className="w-[4.5rem] text-center text-base font-medium text-muted">
                    수정시간
                  </span>
                  <span className="w-[4.5rem] text-center text-base font-medium text-muted">
                    용량
                  </span>
                  <span className="w-10 shrink-0" aria-hidden />
                </div>
              </div>
            ) : null}
          </div>

          <div
            className={cn(
              "flex flex-col md:flex-1",
              LIST_BODY_MIN_CLASS,
            )}
          >
            {viewItems.length === 0 ? (
              <div className="flex flex-1 items-center justify-center px-4 py-8">
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
              <p className="flex flex-1 items-center px-4 py-5 text-base leading-5 text-muted sm:px-6">
                검색 결과가 없습니다.
              </p>
            ) : (
              grouped.map((group) => {
                const visibleCount = group.items.length;
                return (
                <div key={group.key}>
                  <div className="flex items-baseline justify-between gap-3 bg-card px-4 pb-1 pt-3 sm:px-6 sm:pb-1.5 sm:pt-2.5">
                    <p className="text-base font-semibold tracking-wide text-muted">
                      {group.label}
                    </p>
                    {visibleCount > 1 ? (
                      <p className="shrink-0 text-base font-medium tabular-nums text-muted-2">
                        {visibleCount}개
                      </p>
                    ) : null}
                  </div>
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
              })
            )}
          </div>

          <nav
            className="flex min-w-0 flex-wrap items-center justify-center gap-1 border-t border-border bg-card px-2 py-2"
            aria-label="보관 파일 페이지"
          >
            <button
              type="button"
              aria-label="이전 페이지"
              disabled={currentPage <= 1 || filtered.length === 0}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className={cn(
                "inline-flex min-h-12 min-w-12 items-center justify-center rounded-full transition-colors md:h-10 md:min-h-0 md:w-10 md:min-w-0",
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
                    "inline-flex min-h-12 min-w-12 items-center justify-center rounded-full px-2 text-base tabular-nums transition-colors md:h-10 md:min-h-0 md:min-w-10",
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
                "inline-flex min-h-12 min-w-12 items-center justify-center rounded-full transition-colors md:h-10 md:min-h-0 md:w-10 md:min-w-0",
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

/** 타이틀 아래(모바일) / 크롬 좌측(데스크톱) 용량 게이지. 사용량 / 한도. */
function VaultQuotaGauge({ usage }: { usage: VaultUsage | null }) {
  const quota = usage?.quota ?? VAULT_QUOTA_BYTES;
  const used = usage?.used ?? 0;
  const ratio = quota > 0 ? Math.min(1, used / quota) : 0;
  const pct = Math.round(ratio * 1000) / 10;
  const barPct = Math.min(100, Math.max(0, (used / Math.max(quota, 1)) * 100));
  const tight = ratio >= 0.9;

  return (
    <div
      className="flex h-11 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-full bg-card px-3.5 ring-1 ring-border sm:gap-3 sm:px-4"
      title={`${pct}% 사용, ${formatVaultSize(used)} / ${formatVaultSize(quota)}`}
    >
      <div
        className="relative h-2 min-w-[5.5rem] flex-1 overflow-hidden rounded-full bg-surface-2"
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
          "min-w-0 shrink-0 whitespace-nowrap text-right text-base font-semibold tabular-nums leading-none",
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
                className={cn(MORE_MENU_ITEM_CLASS, "text-masked hover:bg-masked-soft")}
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
        "flex min-h-12 min-w-0 items-center gap-2.5 px-4 py-3 transition-colors sm:min-h-14 sm:gap-3 sm:px-6 sm:py-3.5",
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
        className="h-10 w-10"
      />
      {/* 종류는 타일의 확장자로 읽는다. 모바일 보조문구는 용량만. */}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-lg font-semibold leading-6",
            selecting && checked ? "text-primary" : "text-foreground",
          )}
        >
          {item.name}
        </p>
        <p className="mt-0.5 truncate text-base leading-5 text-muted sm:hidden">
          {sizeLabel}
        </p>
      </div>
      <div className="hidden shrink-0 items-center gap-5 sm:flex">
        <span className="w-[4.5rem] text-center text-base tabular-nums text-muted">
          {timeLabel}
        </span>
        <span className="w-[4.5rem] text-center text-base tabular-nums text-muted">
          {sizeLabel}
        </span>
      </div>
      {selecting ? (
        <span className="w-12 shrink-0 md:w-10" aria-hidden />
      ) : (
        <VaultItemMoreMenu
          fileName={item.name}
          busy={busy}
          onDownload={onDownload}
          onShare={onShare}
          onRemove={onRemove}
        />
      )}
    </li>
  );
}
