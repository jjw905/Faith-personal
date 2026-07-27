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
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { useFileUpload } from "@/hooks/use-file-upload";
import { formatBytes } from "@/lib/storage/quota";
import { stripFileExtension } from "@/lib/meeting-process";
import {
  MAX_UPLOAD_AUDIO_MINUTES,
} from "@/lib/stt/upload-limits";
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
  const { scenarioId, isLive } = usePageUxPreview();
  const [mode, setMode] = useState<Mode>("idle");
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
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
  } = useFileUpload({ persist: isLive });

  useEffect(() => {
    if (
      scenarioId === "popup-vault-picker" ||
      scenarioId === "popup-vault-picker-loading" ||
      scenarioId === "popup-vault-picker-empty"
    ) {
      setMode("upload");
      setVaultPickerOpen(true);
      return;
    }
    if (
      scenarioId === "popup-duplicate" ||
      scenarioId === "popup-uploading" ||
      scenarioId === "popup-starting"
    ) {
      setMode("upload");
      setVaultPickerOpen(false);
      return;
    }
    if (
      scenarioId === "live" ||
      scenarioId === "empty" ||
      scenarioId === "full" ||
      scenarioId === "popup-notifications-expand" ||
      scenarioId === "popup-account" ||
      scenarioId === "popup-upcoming" ||
      scenarioId === "popup-upcoming-create" ||
      scenarioId === "popup-participants" ||
      scenarioId === "popup-records-delete" ||
      scenarioId === "popup-records-download" ||
      scenarioId === "popup-sort" ||
      scenarioId === "anim-processing"
    ) {
      setVaultPickerOpen(false);
      if (scenarioId !== "live") setMode("idle");
    }
  }, [scenarioId]);

  function openUpload() {
    setMode("upload");
  }

  function closeUpload() {
    if (
      scenarioId === "popup-vault-picker" ||
      scenarioId === "popup-vault-picker-loading" ||
      scenarioId === "popup-vault-picker-empty" ||
      scenarioId === "popup-duplicate" ||
      scenarioId === "popup-uploading" ||
      scenarioId === "popup-starting"
    ) {
      return;
    }
    clearFile();
    setStartError(null);
    setMode("idle");
  }

  const previewUploading = scenarioId === "popup-uploading";
  const previewStarting = scenarioId === "popup-starting";
  const showUploading = previewUploading || uploadStatus === "uploading";
  const showStarting = previewStarting || starting;

  async function startMeeting() {
    if (!storedId || starting) return;
    setStarting(true);
    setStartError(null);
    try {
      if (!isLive) {
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        return;
      }
      const res = await fetch("/api/meetings/from-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultFileId: storedId,
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

  const ready =
    previewStarting || (uploadStatus === "done" && Boolean(selectedFile));

  return (
    <div className="w-full space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="min-w-0 p-0.5">
          <Link
            href={`/meetings/new?workspace=${workspaceId}`}
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
              "group flex h-24 w-full origin-center cursor-pointer items-center gap-4 rounded-2xl bg-card px-6 text-left shadow-soft ring-1 ring-border transition-[transform,box-shadow,background-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.008] hover:bg-surface hover:shadow-[0_10px_28px_rgba(17,24,46,0.1)] motion-reduce:transition-colors motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100",
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
        <div className="panel-surface overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
            <p className="text-sm font-semibold tracking-tight text-foreground">
              {ready ? "회의 정리" : "오디오 업로드"}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 cursor-pointer text-foreground/70 hover:bg-surface-2 hover:text-foreground"
              onClick={closeUpload}
              aria-label="업로드 닫기"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {ready ? (
            <div className="space-y-4 px-4 py-5 sm:px-5">
              <div className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-3 sm:px-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <FileAudio className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {selectedFile
                      ? stripFileExtension(selectedFile.name)
                      : "주간회의"}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-muted">
                    {selectedFile ? formatBytes(selectedFile.size) : "2.4 MB"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 shrink-0 text-muted hover:text-foreground"
                  disabled={showStarting}
                  onClick={() => {
                    if (previewStarting) return;
                    clearFile();
                    setStartError(null);
                  }}
                >
                  바꾸기
                </Button>
              </div>

              {startError ? (
                <p className="text-sm font-medium text-red-600" role="alert">
                  {startError}
                </p>
              ) : null}

              <button
                type="button"
                disabled={showStarting || (!storedId && !previewStarting)}
                onClick={() => {
                  if (previewStarting) return;
                  void startMeeting();
                }}
                className={cn(
                  "flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 text-base font-semibold tracking-tight text-primary-foreground shadow-soft transition-colors",
                  showStarting || (!storedId && !previewStarting)
                    ? "cursor-not-allowed opacity-70"
                    : "hover:bg-primary-hover",
                )}
              >
                {showStarting ? (
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
                {uploadStatus !== "uploading" && !previewUploading && (
                  <input
                    type="file"
                    accept={acceptedFormats.join(",")}
                    onChange={handleFileSelect}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="오디오 파일 업로드"
                  />
                )}

                {showUploading ? (
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
                          : previewUploading
                            ? "주간회의"
                            : null}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                      <Upload className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <p className="text-sm font-semibold text-foreground">
                      드래그하거나 클릭해서 업로드
                    </p>
                    <p className="text-xs text-muted">
                      최대 {MAX_UPLOAD_AUDIO_MINUTES}분(1시간), 초과 시 거절
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
                    {uploadStatus === "error" ? (
                      <div className="relative z-10 flex flex-col items-center gap-2 text-center">
                        <p
                          className="max-w-[320px] text-sm font-medium text-red-600"
                          role="alert"
                        >
                          {uploadError ?? "업로드에 실패했습니다."}
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
                    ) : null}
                  </>
                )}
              </div>

              {uploadStatus === "idle" || uploadStatus === "error" ? (
                !previewUploading ? (
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
                ) : null
              ) : null}
            </div>
          )}
        </div>
      )}

      <VaultPickerDialog
        open={
          vaultPickerOpen ||
          scenarioId === "popup-vault-picker" ||
          scenarioId === "popup-vault-picker-loading" ||
          scenarioId === "popup-vault-picker-empty"
        }
        onClose={() => {
          if (
            scenarioId === "popup-vault-picker" ||
            scenarioId === "popup-vault-picker-loading" ||
            scenarioId === "popup-vault-picker-empty"
          ) {
            return;
          }
          setVaultPickerOpen(false);
        }}
        onPick={(file, meta) => attachExistingFile(file, meta.id)}
      />

      <DuplicateVaultNameDialog
        open={pendingDuplicate || scenarioId === "popup-duplicate"}
        originalName={
          duplicateOriginalName ??
          (scenarioId === "popup-duplicate" ? "주간회의.m4a" : "")
        }
        nextName={
          duplicateNextName ??
          (scenarioId === "popup-duplicate" ? "주간회의 (1).m4a" : "")
        }
        busy={uploadStatus === "uploading"}
        onCancel={() => {
          if (scenarioId === "popup-duplicate") return;
          cancelDuplicateUpload();
        }}
        onConfirm={() => {
          if (scenarioId === "popup-duplicate") return;
          confirmDuplicateUpload();
        }}
      />
    </div>
  );
}
