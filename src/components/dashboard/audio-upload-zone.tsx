"use client";

import Link from "next/link";
import { Archive, CheckCircle2, Mic, Upload, X } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { VaultPickerDialog } from "@/components/vault/vault-picker";
import { useFileUpload } from "@/hooks/use-file-upload";
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
}: {
  ctaStart?: string;
  ctaUpload?: string;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "ADMIN";

  const {
    isDragging,
    selectedFile,
    uploadStatus,
    uploadError,
    acceptedFormats,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileSelect,
    attachExistingFile,
    clearFile,
  } = useFileUpload();

  function openUpload() {
    setMode("upload");
  }

  function closeUpload() {
    clearFile();
    setMode("idle");
  }

  return (
    <div className="w-full space-y-3">
      <div
        className={cn(
          "grid gap-3",
          isAdmin ? "sm:grid-cols-2" : "sm:grid-cols-1",
        )}
      >
        {isAdmin ? (
          <Link
            href="/meetings/new"
            className="flex h-24 cursor-pointer items-center gap-4 rounded-2xl bg-primary px-6 text-left text-primary-foreground shadow-soft transition-colors hover:bg-primary-hover"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-primary">
              <Mic className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span className="text-lg font-semibold tracking-tight">
              {ctaStart}
            </span>
          </Link>
        ) : null}

        <button
          type="button"
          onClick={openUpload}
          className={cn(
            "flex h-24 cursor-pointer items-center gap-4 rounded-2xl border border-border bg-card px-6 text-left shadow-soft transition-colors hover:bg-surface",
            mode === "upload" && "border-primary bg-primary-soft",
          )}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Upload className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            {ctaUpload}
          </span>
        </button>
      </div>

      {mode === "upload" && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                오디오 파일 업로드
              </p>
              <p className="mt-0.5 text-xs text-muted">
                대화를 인식할 수 있는 파일만 기능을 원활하게 이용 가능합니다.
              </p>
            </div>
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

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative flex min-h-[168px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-5 transition-colors",
              isDragging
                ? "border-primary bg-primary-soft"
                : "border-border-strong bg-surface hover:border-primary/40",
            )}
          >
            {uploadStatus !== "done" && (
              <input
                type="file"
                accept={acceptedFormats.join(",")}
                onChange={handleFileSelect}
                className="absolute inset-0 cursor-pointer opacity-0"
                aria-label="오디오 파일 업로드"
              />
            )}

            {uploadStatus === "done" && selectedFile ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <CheckCircle2 className="h-8 w-8 text-success" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    업로드 완료
                  </p>
                  <p className="mt-0.5 max-w-[280px] truncate text-xs text-muted">
                    {selectedFile.name}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                  파일 제거
                </Button>
              </div>
            ) : uploadStatus === "uploading" ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="h-8 w-8 animate-pulse rounded-full bg-primary-soft" />
                <p className="text-sm font-medium text-foreground">
                  업로드 중...
                </p>
                <p className="max-w-[280px] truncate text-xs text-muted">
                  {selectedFile?.name}
                </p>
              </div>
            ) : uploadStatus === "error" ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-sm font-medium text-foreground">
                  업로드 실패
                </p>
                <p className="max-w-[320px] text-xs text-masked">
                  {uploadError ?? "다시 시도해 주세요."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="relative z-10 h-8"
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
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                  <p className="text-sm font-medium text-foreground">
                    드래그하거나 클릭해서 업로드
                  </p>
                  <span className="rounded-md bg-card px-1.5 py-0.5 text-[11px] font-medium text-muted ring-1 ring-border">
                    계정 500MB
                  </span>
                </div>
                <ul className="flex flex-wrap justify-center gap-2">
                  {FORMAT_GUIDES.map((item) => (
                    <li
                      key={item.ext}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5"
                    >
                      <span className="font-mono text-sm font-bold tracking-tight text-primary">
                        {item.ext}
                      </span>
                      <span className="text-xs text-muted">{item.hint}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="relative z-10 h-8 cursor-pointer gap-1.5"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setVaultPickerOpen(true);
                  }}
                >
                  <Archive className="h-3.5 w-3.5" strokeWidth={1.75} />
                  보관함에서
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <VaultPickerDialog
        open={vaultPickerOpen}
        onClose={() => setVaultPickerOpen(false)}
        onPick={(file, meta) => attachExistingFile(file, meta.id)}
      />
    </div>
  );
}
