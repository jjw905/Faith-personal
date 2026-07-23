"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  AudioLines,
  FileAudio,
  Loader2,
  Mic,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { VaultPickerDialog } from "@/components/vault/vault-picker";
import { DuplicateVaultNameDialog } from "@/components/vault/duplicate-name-dialog";
import { useAppContext } from "@/context/app-context";
import { useFileUpload } from "@/hooks/use-file-upload";
import { formatBytes } from "@/lib/storage/quota";
import {
  DEFAULT_STT_MODEL,
  STT_MODELS,
  STT_MODEL_LABELS,
  type SttModel,
} from "@/lib/stt/models";
import { stripFileExtension } from "@/lib/meeting-process";
import {
  VAULT_CHANGED_EVENT,
  VAULT_QUOTA_BYTES,
  formatVaultSize,
  getVaultUsage,
  type VaultUsage,
} from "@/lib/vault";
import { cn } from "@/lib/utils";

type Mode = "idle" | "upload";

const FORMAT_GUIDES = [
  { ext: ".mp3", hint: "음악/음성" },
  { ext: ".wav", hint: "고음질 녹음" },
  { ext: ".m4a", hint: "아이폰 녹음" },
  { ext: ".ogg", hint: "웹 음성" },
  { ext: ".flac", hint: "무손실" },
  { ext: ".webm", hint: "브라우저 녹음" },
] as const;

function formatQuotaChip(bytes: number): string {
  if (bytes < 1024 * 1024) return formatVaultSize(bytes);
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

export function AudioUploadZone({
  ctaStart = "새 회의 시작",
  ctaUpload = "파일 업로드",
  onMeetingStarted,
}: {
  ctaStart?: string;
  ctaUpload?: string;
  onMeetingStarted?: () => void;
}) {
  const router = useRouter();
  const { workspaceId } = useAppContext();
  const [mode, setMode] = useState<Mode>("idle");
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const [vaultUsage, setVaultUsage] = useState<VaultUsage | null>(null);
  const [sttModel, setSttModel] = useState<SttModel>(DEFAULT_STT_MODEL);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const {
    isDragging,
    selectedFile,
    uploadStatus,
    uploadError,
    storedId,
    pendingDuplicate,
    duplicateOriginalName,
    duplicateNextName,
    acceptedFormats,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    confirmDuplicateUpload,
    cancelDuplicateUpload,
    attachExistingFile,
    clearFile,
  } = useFileUpload();

  useEffect(() => {
    if (mode !== "upload") return;
    let alive = true;
    async function loadUsage() {
      try {
        const usage = await getVaultUsage();
        if (alive) setVaultUsage(usage);
      } catch {
        if (alive) setVaultUsage(null);
      }
    }
    void loadUsage();
    function onChanged() {
      void loadUsage();
    }
    window.addEventListener(VAULT_CHANGED_EVENT, onChanged);
    return () => {
      alive = false;
      window.removeEventListener(VAULT_CHANGED_EVENT, onChanged);
    };
  }, [mode]);

  function openUpload() {
    setMode("upload");
  }

  function closeUpload() {
    clearFile();
    setStartError(null);
    setMode("idle");
  }

  async function startMeeting() {
    if (!storedId || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch("/api/meetings/from-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultFileId: storedId,
          model: sttModel,
          title: selectedFile
            ? stripFileExtension(selectedFile.name)
            : undefined,
          workspace: workspaceId,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        href?: string;
        meetingId?: string;
      };
      if (!res.ok || !data.ok || !data.href) {
        throw new Error(data.message ?? "회의 정리를 시작하지 못했습니다.");
      }
      onMeetingStarted?.();
      router.push(data.href);
    } catch (err) {
      setStartError(
        err instanceof Error ? err.message : "회의 정리를 시작하지 못했습니다.",
      );
    } finally {
      setStarting(false);
    }
  }

  const ready = uploadStatus === "done" && selectedFile;

  return (
    <div className="w-full space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 p-0.5">
          <Link
            href="/meetings/new"
            className="group flex h-24 w-full origin-center cursor-pointer items-center gap-4 rounded-2xl bg-primary px-6 text-left text-primary-foreground shadow-soft transition-[transform,box-shadow,background-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.008] hover:bg-primary-hover hover:shadow-[0_10px_28px_rgba(17,24,46,0.14)] motion-reduce:transition-colors motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-primary transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 motion-reduce:group-hover:scale-100">
              <Mic className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              {ctaStart}
            </span>
          </Link>
        </div>

        <div className="min-w-0 p-0.5">
          <button
            type="button"
            onClick={openUpload}
            className={cn(
              "group flex h-24 w-full origin-center cursor-pointer items-center gap-4 rounded-2xl bg-surface px-6 text-left shadow-soft transition-[transform,box-shadow,background-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.008] hover:bg-surface-2 hover:shadow-[0_10px_28px_rgba(17,24,46,0.1)] motion-reduce:transition-colors motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100",
              mode === "upload" && "bg-primary-soft",
            )}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 motion-reduce:group-hover:scale-100">
              <Upload className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              {ctaUpload}
            </span>
          </button>
        </div>
      </div>

      {mode === "upload" && (
        <div className="overflow-hidden rounded-2xl bg-card shadow-soft">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <p className="text-sm font-semibold tracking-tight text-foreground">
              {ready ? "회의 정리" : "오디오 업로드"}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              {!ready ? (
                <span
                  className="rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground"
                  title={
                    vaultUsage
                      ? `${formatVaultSize(vaultUsage.used)} / ${formatVaultSize(vaultUsage.quota)}`
                      : undefined
                  }
                >
                  {vaultUsage
                    ? `${formatQuotaChip(vaultUsage.remaining)} 남음`
                    : `계정 ${formatQuotaChip(VAULT_QUOTA_BYTES)}`}
                </span>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 cursor-pointer text-foreground/70 hover:bg-surface-2 hover:text-foreground"
                onClick={closeUpload}
                aria-label="업로드 닫기"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {ready ? (
            <div className="space-y-4 px-4 py-5 sm:px-5">
              <div className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-3 sm:px-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <FileAudio className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {stripFileExtension(selectedFile.name)}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted">
                    {formatBytes(selectedFile.size)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 shrink-0 text-muted hover:text-foreground"
                  disabled={starting}
                  onClick={() => {
                    clearFile();
                    setStartError(null);
                  }}
                >
                  바꾸기
                </Button>
              </div>

              <div
                role="radiogroup"
                aria-label="모델"
                className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1"
              >
                {STT_MODELS.map((model) => {
                  const selected = sttModel === model;
                  return (
                    <button
                      key={model}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setSttModel(model)}
                      className={cn(
                        "rounded-xl px-2 py-2.5 text-center text-sm font-semibold transition-colors",
                        selected
                          ? "bg-card text-foreground shadow-soft"
                          : "text-muted hover:text-foreground",
                      )}
                    >
                      {STT_MODEL_LABELS[model]}
                    </button>
                  );
                })}
              </div>

              {startError ? (
                <p className="text-sm text-muted">{startError}</p>
              ) : null}

              <button
                type="button"
                disabled={starting || !storedId}
                onClick={() => void startMeeting()}
                className={cn(
                  "flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 text-base font-semibold tracking-tight text-primary-foreground shadow-soft transition-colors",
                  starting || !storedId
                    ? "cursor-not-allowed opacity-70"
                    : "hover:bg-primary-hover",
                )}
              >
                {starting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.75} />
                    시작 중…
                  </>
                ) : (
                  <>
                    <AudioLines className="h-5 w-5" strokeWidth={1.75} />
                    시작
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-0">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "relative flex min-h-[188px] w-full flex-col items-center justify-center gap-3 px-4 py-6 transition-colors sm:px-5",
                  isDragging
                    ? "bg-primary-soft"
                    : "bg-surface/40 hover:bg-surface/70",
                )}
              >
                {uploadStatus !== "uploading" && (
                  <input
                    type="file"
                    accept={acceptedFormats.join(",")}
                    onChange={handleFileSelect}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="오디오 파일 업로드"
                  />
                )}

                {uploadStatus === "uploading" ? (
                  <div className="flex flex-col items-center gap-3 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                      <Loader2
                        className="h-6 w-6 animate-spin"
                        strokeWidth={1.75}
                      />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        업로드 중
                      </p>
                      <p className="mt-1 max-w-[280px] truncate text-xs text-muted">
                        {selectedFile
                          ? stripFileExtension(selectedFile.name)
                          : null}
                      </p>
                    </div>
                  </div>
                ) : uploadStatus === "error" ? (
                  <div className="relative z-10 flex flex-col items-center gap-3 text-center">
                    <p className="text-sm font-semibold text-foreground">
                      업로드 실패
                    </p>
                    <p className="max-w-[320px] text-xs text-muted">
                      {uploadError ?? "다시 시도해 주세요."}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearFile();
                      }}
                    >
                      다시 선택
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                      <Upload className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <p className="text-sm font-semibold text-foreground">
                      드래그하거나 클릭해서 업로드
                    </p>
                    <ul className="flex flex-wrap justify-center gap-2">
                      {FORMAT_GUIDES.map((item) => (
                        <li
                          key={item.ext}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5"
                        >
                          <span className="font-mono text-sm font-bold tracking-tight text-primary">
                            {item.ext}
                          </span>
                          <span className="text-xs text-muted">{item.hint}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              {uploadStatus === "idle" || uploadStatus === "error" ? (
                <div className="px-4 py-4 sm:px-5">
                  <div
                    className="mb-3 flex items-center gap-3"
                    aria-hidden
                  >
                    <span className="h-px flex-1 bg-surface-2" />
                    <span className="text-xs font-semibold tracking-wide text-muted-2">
                      또는
                    </span>
                    <span className="h-px flex-1 bg-surface-2" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setVaultPickerOpen(true)}
                    className="flex h-14 w-full cursor-pointer items-center gap-3 rounded-2xl bg-primary-soft px-4 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <Archive className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-foreground">
                        보관함에서 고르기
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        올려 둔 파일 바로 사용
                      </span>
                    </span>
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      <VaultPickerDialog
        open={vaultPickerOpen}
        onClose={() => setVaultPickerOpen(false)}
        onPick={(file, meta) => attachExistingFile(file, meta.id)}
      />

      <DuplicateVaultNameDialog
        open={pendingDuplicate}
        originalName={duplicateOriginalName ?? ""}
        nextName={duplicateNextName ?? ""}
        busy={uploadStatus === "uploading"}
        onCancel={cancelDuplicateUpload}
        onConfirm={confirmDuplicateUpload}
      />
    </div>
  );
}
