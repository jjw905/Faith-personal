"use client";

import { FileIcon, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MeetingSearch } from "@/components/dashboard/meeting-search";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import {
  VAULT_CHANGED_EVENT,
  VAULT_MAX_BYTES,
  VAULT_QUOTA_BYTES,
  addVaultFile,
  clearVault,
  formatVaultSize,
  getVaultBundle,
  removeVaultItem,
  type VaultItemMeta,
  type VaultUsage,
} from "@/lib/vault";
import { cn } from "@/lib/utils";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<VaultItemMeta[]>([]);
  const [usage, setUsage] = useState<VaultUsage | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, query]);

  const grouped = useMemo(() => groupVaultByDay(filtered), [filtered]);

  async function ingestFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        await addVaultFile(file);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer className="!pb-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        <header className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <h1 className="shrink-0 text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem] sm:leading-9">
                보관함
              </h1>
              <VaultQuotaGauge usage={usage} />
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {items.length > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 cursor-pointer rounded-full px-4"
                  disabled={busy}
                  onClick={() => {
                    if (!window.confirm("보관함 파일을 모두 삭제할까요?")) return;
                    void clearVault().then(refresh);
                  }}
                >
                  전체 비우기
                </Button>
              ) : null}
              <Button
                type="button"
                className="h-11 cursor-pointer gap-2 rounded-full px-5 text-[15px]"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
              >
                <Upload
                  className="h-[1.125rem] w-[1.125rem]"
                  strokeWidth={1.75}
                />
                올리기
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => {
                if (event.target.files) void ingestFiles(event.target.files);
                event.target.value = "";
              }}
            />
          </div>
          <div className="mt-3">
            <MeetingSearch
              value={query}
              onChange={setQuery}
              label="파일 검색"
              placeholder="파일 검색"
              className="h-12 max-w-none rounded-2xl"
            />
          </div>
        </header>

        {error ? (
          <p className="text-sm text-masked" role="alert">
            {error}
          </p>
        ) : null}

        <section
          aria-labelledby="vault-list-heading"
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            void ingestFiles(event.dataTransfer.files);
          }}
          className={cn(
            "flex min-h-[28rem] flex-col overflow-hidden rounded-xl bg-card shadow-soft transition-[box-shadow,background-color] sm:min-h-[32rem]",
            dragOver && "bg-primary-soft ring-2 ring-primary",
          )}
        >
          <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4">
            <h2
              id="vault-list-heading"
              className="truncate text-sm font-medium text-foreground"
            >
              보관 파일
              <span className="ml-2 font-normal tabular-nums text-muted">
                {" "}
                {filtered.length}
                {query.trim() && filtered.length !== items.length
                  ? ` / ${items.length}`
                  : null}
              </span>
            </h2>
            <p className="shrink-0 text-xs tabular-nums text-muted-2">
              {dragOver
                ? "여기에 놓기"
                : `최대 ${formatVaultSize(VAULT_MAX_BYTES)}`}
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-sm leading-5 text-muted">
                올린 파일이 없습니다.
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-6 text-sm leading-5 text-muted">
                검색 결과가 없습니다.
              </p>
            ) : (
              grouped.map((group) => (
                <div key={group.key}>
                  <p className="sticky top-0 z-10 bg-card px-4 pb-1 pt-3 text-xs font-semibold tracking-wide text-muted-2">
                    {group.label}
                    <span className="ml-1.5 font-normal tabular-nums text-muted-2">
                      {group.items.length}
                    </span>
                  </p>
                  <ul className="divide-y divide-border/60">
                    {group.items.map((item) => (
                      <VaultListItem
                        key={item.id}
                        item={item}
                        busy={busy}
                        onRemove={() => {
                          void removeVaultItem(item.id).then(refresh);
                        }}
                      />
                    ))}
                  </ul>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}

/** 타이틀 옆 용량 게이지. 사용량 / 한도. */
function VaultQuotaGauge({ usage }: { usage: VaultUsage | null }) {
  const quota = usage?.quota ?? VAULT_QUOTA_BYTES;
  const used = usage?.used ?? 0;
  const ratio = quota > 0 ? Math.min(1, used / quota) : 0;
  const pct = Math.round(ratio * 1000) / 10;
  const barPct = Math.max(ratio > 0 ? 2 : 0, Math.round(ratio * 100));
  const tight = ratio >= 0.9;

  return (
    <div
      className="flex min-w-0 max-w-[16rem] flex-1 items-center gap-2.5 sm:max-w-[18rem]"
      title={`${pct}% 사용`}
    >
      <div
        className="relative h-1.5 min-w-[4.5rem] flex-1 overflow-hidden rounded-full bg-surface-2"
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
          "shrink-0 text-xs font-medium tabular-nums",
          tight ? "text-warning" : "text-muted",
        )}
      >
        {formatVaultSize(used)} / {formatVaultSize(quota)}
      </p>
    </div>
  );
}

/** M3 two-line list: 40dp leading, headline, supporting, 40dp trailing */
function VaultListItem({
  item,
  busy,
  onRemove,
}: {
  item: VaultItemMeta;
  busy: boolean;
  onRemove: () => void;
}) {
  const when = new Date(item.createdAt).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <li className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface/70">
      <span
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-foreground"
        aria-hidden
      >
        <FileIcon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1 py-0.5">
        <p className="truncate text-sm font-medium leading-5 text-foreground">
          {item.name}
        </p>
        <p className="mt-0.5 truncate text-xs leading-4 tabular-nums text-muted">
          {formatVaultSize(item.size)}, {when}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-10 w-10 shrink-0 cursor-pointer rounded-full text-masked hover:bg-masked-soft hover:text-masked"
        aria-label={`${item.name} 삭제`}
        disabled={busy}
        onClick={onRemove}
      >
        <Trash2 className="h-5 w-5" strokeWidth={1.75} />
      </Button>
    </li>
  );
}
