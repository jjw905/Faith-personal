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
  Users,
  X,
} from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useState,
} from "react";

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
import { UploadQuotaBanner } from "@/components/dashboard/upload-quota-banner";
import {
  PRECISION_USAGE_MULTIPLIER,
  type AnalysisMode,
} from "@/lib/stt/analysis-mode";
import {
  UsageLimitDialog,
  type UsageLimitTimeStatus,
} from "@/components/dashboard/usage-limit-dialog";

type Mode = "idle" | "upload";

/** 디자인·UX 미리보기용 단계. 제품 경로는 쓰지 않는다. */
export type AudioUploadDemoPhase =
  | "panel"
  | "uploading"
  | "ready"
  | "starting"
  | "error";

const DEMO_FILE_NAME = "assembly-7min (1).m4a";
const DEMO_FILE_BYTES = 2_450_000;

const UPLOAD_FLOW_PHASES: Array<{
  phase: AudioUploadDemoPhase;
  atMs: number;
}> = [
  { phase: "panel", atMs: 0 },
  { phase: "uploading", atMs: 1100 },
  { phase: "ready", atMs: 2800 },
  { phase: "starting", atMs: 4300 },
];

const FORMAT_GUIDES = [
  { ext: ".mp3", hint: "음악/음성" },
  { ext: ".wav", hint: "고음질 녹음" },
  { ext: ".m4a", hint: "아이폰 녹음" },
  { ext: ".ogg", hint: "웹 음성" },
  { ext: ".flac", hint: "무손실" },
  { ext: ".webm", hint: "브라우저 녹음" },
] as const;

export type AudioUploadZoneHandle = {
  openUpload: () => void;
};

export const AudioUploadZone = forwardRef<
  AudioUploadZoneHandle,
  {
    ctaStart?: string;
    ctaUpload?: string;
    onMeetingStarted?: () => void;
    /** 모바일은 하단 추적형 바에 CTA를 두고, 상단 큰 CTA는 숨김 */
    hideMobileCtas?: boolean;
    /** 디자인 랩·시나리오 강제 단계 */
    demoPhase?: AudioUploadDemoPhase | null;
  }
>(function AudioUploadZone(
  {
    ctaStart = "새 회의 시작",
    ctaUpload = "파일 업로드",
    onMeetingStarted,
    hideMobileCtas = false,
    demoPhase = null,
  },
  ref,
) {
  const router = useRouter();
  const { workspaceId, activeTeamId } = useAppContext();
  const { scenarioId, isLive } = usePageUxPreview();
  const [mode, setMode] = useState<Mode>("idle");
  const fileInputId = useId();
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [flowPhase, setFlowPhase] = useState<AudioUploadDemoPhase>("panel");
  const [quotaStatus, setQuotaStatus] = useState<UsageLimitTimeStatus | null>(
    null,
  );
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [analysisMode, setAnalysisMode] =
    useState<AnalysisMode>("standard");

  function applyQuotaPayload(
    data: { ok?: boolean } & Partial<UsageLimitTimeStatus>,
  ): UsageLimitTimeStatus | null {
    if (
      !data.ok ||
      typeof data.limitSec !== "number" ||
      typeof data.usedSec !== "number" ||
      typeof data.remainingSec !== "number"
    ) {
      return null;
    }
    return {
      limitSec: data.limitSec,
      usedSec: data.usedSec,
      remainingSec: data.remainingSec,
      monthlyLimitSec: data.monthlyLimitSec,
      creditRemainingSec: data.creditRemainingSec,
      graceRemainingSec: data.graceRemainingSec,
      surveyCompleted: Boolean(data.surveyCompleted),
      resetsAtLabel: data.resetsAtLabel ?? "다음 주기",
      enforced: data.enforced !== false,
    };
  }

  const {
    isDragging,
    selectedFile,
    selectedDurationSec,
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
      scenarioId === "popup-starting" ||
      scenarioId === "popup-start-ready" ||
      scenarioId === "popup-start-error" ||
      scenarioId === "anim-upload-flow"
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

  useEffect(() => {
    if (scenarioId !== "anim-upload-flow" || demoPhase) return;
    let cancelled = false;
    const timers = new Set<number>();

    const run = () => {
      if (cancelled) return;
      setFlowPhase("panel");
      for (const { phase, atMs } of UPLOAD_FLOW_PHASES.slice(1)) {
        timers.add(
          window.setTimeout(() => {
            if (!cancelled) setFlowPhase(phase);
          }, atMs),
        );
      }
      timers.add(
        window.setTimeout(() => {
          if (!cancelled) run();
        }, 6500),
      );
    };

    run();
    return () => {
      cancelled = true;
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
    };
  }, [scenarioId, demoPhase]);

  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/usage/quota", { cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
        } & Partial<UsageLimitTimeStatus>;
        const next = applyQuotaPayload(data);
        if (!cancelled && next) setQuotaStatus(next);
      } catch {
        // 조회 실패 시 서버가 실제 시작 시점에 다시 검사한다.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLive]);

  const openUpload = useCallback(() => {
    if (
      isLive &&
      quotaStatus?.enforced !== false &&
      quotaStatus &&
      quotaStatus.remainingSec <= 0
    ) {
      setUsageDialogOpen(true);
      return;
    }
    setMode("upload");
  }, [isLive, quotaStatus]);

  useImperativeHandle(ref, () => ({ openUpload }), [openUpload]);

  function closeUpload() {
    if (
      scenarioId === "popup-vault-picker" ||
      scenarioId === "popup-vault-picker-loading" ||
      scenarioId === "popup-vault-picker-empty" ||
      scenarioId === "popup-duplicate" ||
      scenarioId === "popup-uploading" ||
      scenarioId === "popup-starting" ||
      scenarioId === "popup-start-ready" ||
      scenarioId === "popup-start-error" ||
      scenarioId === "anim-upload-flow" ||
      demoPhase
    ) {
      return;
    }
    clearFile();
    setStartError(null);
    setMode("idle");
  }

  const resolvedDemo: AudioUploadDemoPhase | null =
    demoPhase ??
    (scenarioId === "anim-upload-flow"
      ? flowPhase
      : scenarioId === "popup-uploading"
        ? "uploading"
        : scenarioId === "popup-starting"
          ? "starting"
          : scenarioId === "popup-start-ready"
            ? "ready"
            : scenarioId === "popup-start-error"
              ? "error"
              : null);

  const previewUploading = resolvedDemo === "uploading";
  const previewStarting = resolvedDemo === "starting";
  const previewReady = resolvedDemo === "ready" || resolvedDemo === "error";
  const previewPanel = resolvedDemo === "panel";
  const showUploading = previewUploading || uploadStatus === "uploading";
  const showStarting = previewStarting || starting;
  const demoActive = resolvedDemo != null;

  async function startMeeting() {
    if (starting) return;
    if (!storedId) {
      setStartError("파일을 아직 준비 중입니다. 잠시 후 다시 눌러 주세요.");
      return;
    }
    if (isLive) {
      try {
        const res = await fetch("/api/usage/quota", { cache: "no-store" });
        const data = (await res.json()) as {
          ok?: boolean;
        } & Partial<UsageLimitTimeStatus>;
        const fresh = applyQuotaPayload(data);
        if (fresh) {
          setQuotaStatus(fresh);
          if (fresh.enforced !== false && fresh.remainingSec <= 0) {
            setUsageDialogOpen(true);
            return;
          }
          // 남은 시간보다 긴 파일이면 서버가 나중에 거절한다. 미리 막는다.
          if (
            fresh.enforced !== false &&
            selectedFile &&
            fresh.remainingSec > 0
          ) {
            const durationSec = await new Promise<number | null>((resolve) => {
              const url = URL.createObjectURL(selectedFile);
              const audio = document.createElement("audio");
              const finish = (sec: number | null) => {
                URL.revokeObjectURL(url);
                resolve(sec);
              };
              audio.preload = "metadata";
              audio.onloadedmetadata = () => {
                const d = audio.duration;
                finish(Number.isFinite(d) && d > 0 ? d : null);
              };
              audio.onerror = () => finish(null);
              audio.src = url;
            });
            const chargedSec =
              durationSec == null
                ? null
                : Math.ceil(
                    durationSec *
                      (analysisMode === "precision"
                        ? PRECISION_USAGE_MULTIPLIER
                        : 1),
                  );
            if (chargedSec != null && chargedSec > fresh.remainingSec) {
              setUsageDialogOpen(true);
              return;
            }
          }
        }
      } catch {
        // 조회 실패해도 서버가 실제 처리 시점에 다시 검사한다.
      }
    }
    setStarting(true);
    setStartError(null);
    try {
      if (!isLive) {
        await new Promise((resolve) => window.setTimeout(resolve, 900));
        setStartError(null);
        // 미리보기: 시작 중 상태를 유지해 반응이 보이게 둔다.
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
          analysisMode,
          ...(workspaceId === "team" && activeTeamId
            ? { teamId: activeTeamId }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        href?: string;
        meetingId?: string;
        code?: string;
        quota?: UsageLimitTimeStatus;
      };
      if (
        res.status === 429 ||
        data.code === "UPLOAD_QUOTA_EXCEEDED"
      ) {
        if (data.quota) {
          setQuotaStatus({
            ...data.quota,
            enforced: data.quota.enforced !== false,
          });
        }
        setUsageDialogOpen(true);
        setStarting(false);
        return;
      }
      if (!res.ok || !data.ok || !data.href) {
        throw new Error(data.message ?? "회의 정리를 시작하지 못했습니다.");
      }
      onMeetingStarted?.();
      router.push(data.href);
      // 이동 전까지 시작 중 유지. 성공 시 버튼을 다시 켜지 않는다.
    } catch (err) {
      setStartError(
        err instanceof Error ? err.message : "회의 정리를 시작하지 못했습니다.",
      );
      setStarting(false);
    }
  }

  // 업로드 완료 + 보관함 id가 있어야 시작 가능. id 없이 done만 보이면 무반응처럼 느껴진다.
  const liveReady =
    uploadStatus === "done" && Boolean(selectedFile) && Boolean(storedId);
  const ready =
    previewStarting ||
    previewReady ||
    liveReady ||
    (uploadStatus === "done" && Boolean(selectedFile) && !storedId);

  const awaitingStoreId =
    !demoActive &&
    uploadStatus === "done" &&
    Boolean(selectedFile) &&
    !storedId;

  const demoFileLabel = stripFileExtension(DEMO_FILE_NAME);
  const fileLabel = selectedFile
    ? stripFileExtension(selectedFile.name)
    : demoActive
      ? demoFileLabel
      : null;
  const fileSizeLabel = selectedFile
    ? formatBytes(selectedFile.size)
    : demoActive
      ? formatBytes(DEMO_FILE_BYTES)
      : null;
  const actualMinutes =
    selectedDurationSec != null ? Math.max(1, Math.ceil(selectedDurationSec / 60)) : null;
  const expectedChargedMinutes =
    selectedDurationSec == null
      ? null
      : Math.ceil(
          (selectedDurationSec *
            (analysisMode === "precision"
              ? PRECISION_USAGE_MULTIPLIER
              : 1)) /
            60,
        );

  const startDisabled =
    showStarting ||
    awaitingStoreId ||
    (!storedId && !previewStarting && !previewReady);

  useEffect(() => {
    if (demoPhase === "panel" || previewPanel) {
      setMode("upload");
    } else if (demoPhase) {
      setMode("upload");
    }
  }, [demoPhase, previewPanel]);

  return (
    <div className="w-full space-y-3">
      <div
        className={cn(
          "grid grid-cols-2 gap-2 sm:gap-3",
          hideMobileCtas && "max-md:hidden",
        )}
      >
        <div className="min-w-0 p-0.5">
          <Link
            href={`/meetings/new?workspace=${workspaceId}`}
            className="group flex h-20 w-full cursor-pointer items-center gap-2.5 rounded-2xl bg-primary px-3.5 text-left text-primary-foreground shadow-soft transition-colors duration-150 hover:bg-primary-hover sm:h-24 sm:gap-4 sm:px-6"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-primary sm:h-11 sm:w-11">
              <Mic className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 text-base font-semibold tracking-tight sm:text-lg">
              {ctaStart}
            </span>
          </Link>
        </div>

        <div className="min-w-0 p-0.5">
          <button
            type="button"
            onClick={openUpload}
            className={cn(
              "group flex h-20 w-full cursor-pointer items-center gap-2.5 rounded-2xl bg-card px-3.5 text-left shadow-soft ring-1 ring-border transition-colors duration-150 hover:bg-surface sm:h-24 sm:gap-4 sm:px-6",
              mode === "upload" && "bg-primary-soft",
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground sm:h-11 sm:w-11">
              <Upload className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 text-base font-semibold tracking-tight text-foreground sm:text-lg">
              {ctaUpload}
            </span>
          </button>
        </div>
      </div>

      {mode === "upload" && (
        <div className="overflow-hidden rounded-3xl bg-card shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border">
          <div className="space-y-0 px-6 pb-0 pt-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xl font-bold tracking-tight text-foreground">
                {ready && !previewPanel ? "회의 정리" : "오디오 업로드"}
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
            <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
          </div>

          {ready && !previewPanel ? (
            <div className="space-y-4 px-6 py-5 animate-[bubble-in_280ms_ease-out] motion-reduce:animate-none">
              <div className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-3 sm:px-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                  <FileAudio className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-foreground">
                    {fileLabel ?? "주간회의"}
                  </p>
                  <p className="mt-0.5 text-base tabular-nums text-muted">
                    {awaitingStoreId
                      ? "준비 중…"
                      : (fileSizeLabel ?? "2.4 MB")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 shrink-0 text-muted hover:text-foreground"
                  disabled={showStarting || demoActive}
                  onClick={() => {
                    if (demoActive) return;
                    clearFile();
                    setStartError(null);
                  }}
                >
                  바꾸기
                </Button>
              </div>

              <div
                className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                role="radiogroup"
                aria-label="분석 방식"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={analysisMode === "standard"}
                  disabled={showStarting}
                  onClick={() => setAnalysisMode("standard")}
                  className={cn(
                    "flex min-h-16 items-start gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-colors",
                    analysisMode === "standard"
                      ? "bg-primary-soft ring-primary"
                      : "bg-surface ring-border hover:bg-surface-2",
                  )}
                >
                  <AudioLines className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>
                    <span className="block text-base font-semibold">
                      일반 분석
                    </span>
                    <span className="mt-0.5 block text-base text-muted">
                      1분당 1차감분
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={analysisMode === "precision"}
                  disabled={showStarting}
                  onClick={() => setAnalysisMode("precision")}
                  className={cn(
                    "flex min-h-16 items-start gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-colors",
                    analysisMode === "precision"
                      ? "bg-primary-soft ring-primary"
                      : "bg-surface ring-border hover:bg-surface-2",
                  )}
                >
                  <Users className="mt-0.5 h-5 w-5 shrink-0" />
                  <span>
                    <span className="block text-base font-semibold">
                      정밀 화자·대화추적
                    </span>
                    <span className="mt-0.5 block text-base text-muted">
                      1분당 1.5차감분
                    </span>
                  </span>
                </button>
              </div>

              {actualMinutes != null && expectedChargedMinutes != null ? (
                <p className="text-base font-medium text-muted">
                  실제 약 {actualMinutes}분, 예상 {expectedChargedMinutes}차감분
                </p>
              ) : (
                <p className="text-base font-medium text-muted">
                  정밀 분석은 화자 구분과 단어 위치를 더 정확하게 맞춥니다.
                </p>
              )}

              {resolvedDemo === "error" || startError ? (
                <p className="text-base font-medium text-red-600" role="alert">
                  {startError ?? "회의 정리를 시작하지 못했습니다."}
                </p>
              ) : awaitingStoreId ? (
                <p className="text-base font-medium text-muted" role="status">
                  파일 연결을 마치는 중…
                </p>
              ) : null}

              <button
                type="button"
                disabled={startDisabled && !previewReady}
                aria-busy={showStarting}
                onClick={() => {
                  if (demoActive) return;
                  void startMeeting();
                }}
                className={cn(
                  "flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-primary px-5 text-base font-semibold tracking-tight text-primary-foreground shadow-soft transition-[opacity,transform,background-color] duration-150",
                  showStarting && "scale-[0.99]",
                  startDisabled && !previewReady && !showStarting
                    ? "cursor-not-allowed opacity-70"
                    : showStarting
                      ? "cursor-wait opacity-90"
                      : "hover:bg-primary-hover",
                )}
              >
                {showStarting || awaitingStoreId ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.75} />
                    {awaitingStoreId ? "준비 중…" : "시작 중…"}
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
                  "relative flex min-h-[188px] w-full flex-col items-center justify-center gap-3 px-6 py-6 transition-colors",
                  isDragging
                    ? "bg-primary-soft"
                    : "bg-surface/40 hover:bg-surface/70",
                )}
              >
                {uploadStatus !== "uploading" && !previewUploading && (
                  <>
                    {/* 보이는 버튼이 진입점. 데스크톱은 영역 탭으로도 열림. */}
                    <input
                      id={fileInputId}
                      type="file"
                      accept={acceptedFormats.join(",")}
                      onChange={handleFileSelect}
                      className="peer sr-only"
                      aria-label="오디오 파일 업로드"
                    />
                    <label
                      htmlFor={fileInputId}
                      className="absolute inset-0 z-0 hidden cursor-pointer md:block"
                    >
                      <span className="sr-only">파일 업로드</span>
                    </label>
                  </>
                )}

                {showUploading ? (
                  <div className="flex flex-col items-center gap-3 text-center animate-[bubble-in_280ms_ease-out] motion-reduce:animate-none">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
                      <Loader2
                        className="h-6 w-6 animate-spin"
                        strokeWidth={1.75}
                      />
                    </span>
                    <div>
                      <p className="text-base font-semibold text-foreground">
                        업로드 중
                      </p>
                      <p className="mt-1 max-w-[280px] truncate text-base text-muted">
                        {fileLabel}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <label
                      htmlFor={fileInputId}
                      className="relative z-10 inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-bold text-primary-foreground transition-colors hover:bg-primary-hover peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2"
                    >
                      <Upload className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                      파일 업로드
                    </label>
                    <p className="relative z-10 text-base text-muted">
                      최대 {MAX_UPLOAD_AUDIO_MINUTES}분(1시간)
                    </p>
                    {isLive && !demoActive ? (
                      <div className="relative z-10 w-full">
                        <UploadQuotaBanner />
                      </div>
                    ) : null}
                    <ul className="relative z-10 flex flex-wrap justify-center gap-2">
                      {FORMAT_GUIDES.map((item) => (
                        <li
                          key={item.ext}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5"
                        >
                          <span className="font-mono text-base font-bold tracking-tight text-primary sm:text-sm">
                            {item.ext}
                          </span>
                          {/* 한국어 설명은 좁은 화면에서 생략. 확장자만으로 충분. */}
                          <span className="hidden text-muted sm:inline sm:text-xs">
                            {item.hint}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {uploadStatus === "error" ? (
                      <div className="relative z-10 flex flex-col items-center gap-2 text-center">
                        <p
                          className="max-w-[320px] text-base font-medium text-red-600"
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
                !previewUploading && !previewPanel ? (
                <div className="px-6 py-4">
                  <div
                    className="mb-3 flex items-center gap-3"
                    aria-hidden
                  >
                    <span className="h-px flex-1 bg-surface-2" />
                    <span className="text-base font-semibold tracking-wide text-muted-2">
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
                      <span className="block text-base font-semibold text-foreground">
                        보관함에서 고르기
                      </span>
                      <span className="mt-0.5 block text-base text-muted">
                        올려 둔 음성 바로 사용
                      </span>
                    </span>
                  </button>
                </div>
                ) : previewPanel ? (
                <div className="px-6 py-4">
                  <div
                    className="mb-3 flex items-center gap-3"
                    aria-hidden
                  >
                    <span className="h-px flex-1 bg-surface-2" />
                    <span className="text-base font-semibold tracking-wide text-muted-2">
                      또는
                    </span>
                    <span className="h-px flex-1 bg-surface-2" />
                  </div>
                  <div className="flex h-14 w-full items-center gap-3 rounded-2xl bg-primary-soft px-4 text-left">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                      <Archive className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-foreground">
                        보관함에서 고르기
                      </span>
                      <span className="mt-0.5 block text-base text-muted">
                        올려 둔 음성 바로 사용
                      </span>
                    </span>
                  </div>
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
        audioOnly
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

      <UsageLimitDialog
        open={usageDialogOpen}
        variant="time"
        timeStatus={quotaStatus}
        onClose={() => setUsageDialogOpen(false)}
      />
    </div>
  );
});
