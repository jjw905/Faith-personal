"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Archive,
  AudioLines,
  FileAudio,
  Loader2,
  Mic,
  RefreshCw,
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
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { VaultPickerDialog } from "@/components/vault/vault-picker";
import { DuplicateVaultNameDialog } from "@/components/vault/duplicate-name-dialog";
import { RecordBeatBars } from "@/components/meetings/record-beat-bars";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { useFileUpload } from "@/hooks/use-file-upload";
import { formatBytes } from "@/lib/storage/quota";
import { stripFileExtension } from "@/lib/meeting-process";
import { resolveAnalysisModeForEntitlement } from "@/lib/plans";
import {
  MAX_UPLOAD_AUDIO_MINUTES,
} from "@/lib/stt/upload-limits";
import { cn } from "@/lib/utils";
import { UploadQuotaBanner } from "@/components/dashboard/upload-quota-banner";
import {
  ANALYSIS_MODE_COPY,
  PRECISION_USAGE_MULTIPLIER,
} from "@/lib/stt/analysis-mode";
import {
  UsageLimitDialog,
  type UsageLimitTimeStatus,
} from "@/components/dashboard/usage-limit-dialog";

type Mode = "idle" | "upload";

/** 디자인·UX 미리보기용 단계. 제품 경로는 쓰지 않는다. */
export type AudioUploadDemoPhase =
  | "panel"
  | "recording"
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

/** 추가 → 녹음 눌러 펼침 → 중지 후 시작 대기 */
const RECORD_FLOW_PHASES: Array<{
  phase: AudioUploadDemoPhase;
  atMs: number;
}> = [
  { phase: "panel", atMs: 0 },
  { phase: "recording", atMs: 700 },
  { phase: "ready", atMs: 3200 },
];

function formatRecordClock(totalSec: number) {
  const sec = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
    /** 상단 CTA를 페이지 헤더에 둘 때 존 안 CTA 그리드 숨김 */
    hideCtas?: boolean;
    /** 처음부터 업로드 패널을 연다 (회의록 생성 페이지) */
    alwaysOpen?: boolean;
    /** 패널 X 숨김 — 페이지 돌아가기로 닫음 */
    hidePanelClose?: boolean;
    /** 브라우저 녹음 진입점 표시 */
    showRecord?: boolean;
    /**
     * 회의록 생성 페이지용. 카드·섹션 헤더·확장자 칩·「또는」 없이
     * 업로드·보관함·녹음을 플랫 리스트로 분배.
     */
    flat?: boolean;
    /** 설문·잔여를 페이지 상단에 둘 때 패널 안 배너 숨김 */
    hideQuotaBanner?: boolean;
    /** 디자인 랩·시나리오 강제 단계 */
    demoPhase?: AudioUploadDemoPhase | null;
  }
>(function AudioUploadZone(
  {
    ctaStart = "새 회의 시작",
    ctaUpload = "파일 업로드",
    onMeetingStarted,
    hideMobileCtas = false,
    hideCtas = false,
    alwaysOpen = false,
    hidePanelClose = false,
    showRecord = false,
    flat = false,
    hideQuotaBanner = false,
    demoPhase = null,
  },
  ref,
) {
  const router = useRouter();
  const { data: session } = useSession();
  const { workspaceId, activeTeamId } = useAppContext();
  const { scenarioId, isLive } = usePageUxPreview();
  const [mode, setMode] = useState<Mode>(alwaysOpen ? "upload" : "idle");
  const fileInputId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [vaultPickerOpen, setVaultPickerOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [flowPhase, setFlowPhase] = useState<AudioUploadDemoPhase>("panel");
  const [quotaStatus, setQuotaStatus] = useState<UsageLimitTimeStatus | null>(
    null,
  );
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordElapsedSec, setRecordElapsedSec] = useState(0);
  const [meetingTitle, setMeetingTitle] = useState("");
  const titleTouchedRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordChunksRef = useRef<BlobPart[]>([]);
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordStartedAtRef = useRef<number | null>(null);
  const automaticAnalysisMode = resolveAnalysisModeForEntitlement(
    session?.user?.plan,
    session?.user?.role,
    workspaceId,
  );

  const speakerSplitAutomatic = automaticAnalysisMode === "precision";

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
    selectFile,
    confirmDuplicateUpload,
    cancelDuplicateUpload,
    attachExistingFile,
    clearFile,
  } = useFileUpload({ persist: isLive });

  useEffect(() => {
    if (!alwaysOpen) return;
    setMode("upload");
  }, [alwaysOpen]);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      recordStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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
      scenarioId === "popup-recording" ||
      scenarioId === "anim-upload-flow" ||
      scenarioId === "anim-record-expand"
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
      scenarioId === "popup-records-delete" ||
      scenarioId === "popup-records-download" ||
      scenarioId === "popup-sort" ||
      scenarioId === "anim-processing"
    ) {
      setVaultPickerOpen(false);
      if (scenarioId !== "live" && !alwaysOpen) setMode("idle");
    }
  }, [scenarioId, alwaysOpen]);

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
    if (scenarioId !== "anim-record-expand" || demoPhase) return;
    let cancelled = false;
    const timers = new Set<number>();

    const run = () => {
      if (cancelled) return;
      setFlowPhase("panel");
      for (const { phase, atMs } of RECORD_FLOW_PHASES.slice(1)) {
        timers.add(
          window.setTimeout(() => {
            if (!cancelled) setFlowPhase(phase);
          }, atMs),
        );
      }
      timers.add(
        window.setTimeout(() => {
          if (!cancelled) run();
        }, 5200),
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

  useEffect(() => {
    if (mode !== "upload" || alwaysOpen) return;
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [mode, alwaysOpen]);

  function stopBrowserTracks() {
    recordStreamRef.current?.getTracks().forEach((track) => track.stop());
    recordStreamRef.current = null;
  }

  function resetMeetingTitle() {
    titleTouchedRef.current = false;
    setMeetingTitle("");
  }

  async function toggleBrowserRecord() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }
    setRecordError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      recordChunksRef.current = [];
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        setRecording(false);
        recordStartedAtRef.current = null;
        setRecordElapsedSec(0);
        mediaRecorderRef.current = null;
        stopBrowserTracks();
        const blob = new Blob(recordChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        recordChunksRef.current = [];
        if (blob.size < 1) {
          setRecordError("녹음이 비어 있습니다. 다시 시도해 주세요.");
          return;
        }
        const stamp = new Intl.DateTimeFormat("ko-KR", {
          timeZone: "Asia/Seoul",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
          .format(new Date())
          .replace(/[.\s:]/g, "")
          .replace(/,/g, "-");
        const file = new File([blob], `녹음_${stamp}.webm`, {
          type: blob.type || "audio/webm",
        });
        selectFile(file);
      };
      recorder.start();
      recordStartedAtRef.current = Date.now();
      setRecordElapsedSec(0);
      setRecording(true);
    } catch {
      stopBrowserTracks();
      setRecording(false);
      recordStartedAtRef.current = null;
      setRecordElapsedSec(0);
      setRecordError("마이크 권한을 허용해 주세요.");
    }
  }

  function closeUpload() {
    if (alwaysOpen || hidePanelClose) {
      if (recording) mediaRecorderRef.current?.stop();
      clearFile();
      setRecordError(null);
      resetMeetingTitle();
      return;
    }
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
    resetMeetingTitle();
    setMode("idle");
  }

  const resolvedDemo: AudioUploadDemoPhase | null =
    demoPhase ??
    (scenarioId === "anim-upload-flow" || scenarioId === "anim-record-expand"
      ? flowPhase
      : scenarioId === "popup-uploading"
        ? "uploading"
        : scenarioId === "popup-starting"
          ? "starting"
          : scenarioId === "popup-start-ready"
            ? "ready"
            : scenarioId === "popup-start-error"
              ? "error"
              : scenarioId === "popup-recording"
                ? "recording"
                : null);

  const previewUploading = resolvedDemo === "uploading";
  const previewStarting = resolvedDemo === "starting";
  const previewReady = resolvedDemo === "ready" || resolvedDemo === "error";
  const previewPanel = resolvedDemo === "panel";
  const previewRecording = resolvedDemo === "recording";
  const showRecordingUi = previewRecording || recording;
  const showUploading = previewUploading || uploadStatus === "uploading";
  const showStarting = previewStarting || starting;
  const demoActive = resolvedDemo != null;

  useEffect(() => {
    if (!showRecordingUi) {
      if (!recording) setRecordElapsedSec(0);
      return;
    }
    if (previewRecording && !recording) {
      setRecordElapsedSec(12);
      const id = window.setInterval(() => {
        setRecordElapsedSec((prev) => prev + 1);
      }, 1000);
      return () => window.clearInterval(id);
    }
    const started = recordStartedAtRef.current ?? Date.now();
    const tick = () => {
      setRecordElapsedSec(Math.floor((Date.now() - started) / 1000));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [showRecordingUi, previewRecording, recording]);

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
                      (automaticAnalysisMode === "precision"
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
          title: meetingTitle.trim() || undefined,
          workspace: workspaceId,
          analysisMode: automaticAnalysisMode,
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
      : Math.max(
          1,
          Math.ceil(
            (selectedDurationSec *
              (automaticAnalysisMode === "precision"
                ? PRECISION_USAGE_MULTIPLIER
                : 1)) /
              60,
          ),
        );
  const remainingMinutes =
    quotaStatus && quotaStatus.enforced !== false
      ? Math.max(0, Math.floor(quotaStatus.remainingSec / 60))
      : null;
  const recordingChargeMinutes = Math.max(
    1,
    Math.ceil(
      (Math.max(recordElapsedSec, 1) *
        (automaticAnalysisMode === "precision"
          ? PRECISION_USAGE_MULTIPLIER
          : 1)) /
        60,
    ),
  );

  useEffect(() => {
    if (!ready || previewPanel) return;
    if (titleTouchedRef.current) return;
    if (!fileLabel) return;
    setMeetingTitle(fileLabel);
  }, [ready, previewPanel, fileLabel]);

  useEffect(() => {
    if (!ready || previewPanel || showStarting) return;
    const id = window.setTimeout(() => {
      titleInputRef.current?.focus({ preventScroll: true });
      titleInputRef.current?.select();
    }, 320);
    return () => window.clearTimeout(id);
  }, [ready, previewPanel, showStarting, storedId, fileLabel]);

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
      {!hideCtas ? (
      <div
        className={cn(
          "grid grid-cols-2 gap-2 sm:gap-3",
          hideMobileCtas && "max-md:hidden",
        )}
      >
        <div className="min-w-0 p-0.5">
          <button
            type="button"
            onClick={openUpload}
            className="group flex h-20 w-full cursor-pointer items-center gap-2.5 rounded-2xl bg-primary px-3.5 text-left text-primary-foreground shadow-soft transition-colors duration-150 hover:bg-primary-hover sm:h-24 sm:gap-4 sm:px-6"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-primary sm:h-11 sm:w-11">
              <Mic className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 truncate text-base font-semibold leading-tight tracking-tight sm:text-lg">
              {ctaStart}
            </span>
          </button>
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
            <span className="min-w-0 truncate text-base font-semibold leading-tight tracking-tight text-foreground sm:text-lg">
              {ctaUpload}
            </span>
          </button>
        </div>
      </div>
      ) : null}

      {mode === "upload" && (
        <div
          ref={panelRef}
          className={cn(
            flat
              ? "w-full"
              : "overflow-hidden rounded-3xl bg-card shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border",
          )}
          onDragOver={flat ? handleDragOver : undefined}
          onDragLeave={flat ? handleDragLeave : undefined}
          onDrop={flat ? handleDrop : undefined}
        >
          {flat ? null : (
          <div className="space-y-0 px-6 pb-0 pt-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xl font-bold tracking-tight text-foreground">
                {ready && !previewPanel ? "정리 시작" : "오디오 업로드"}
              </p>
              {hidePanelClose ? null : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-12 w-12 shrink-0 cursor-pointer text-foreground/70 hover:bg-surface-2 hover:text-foreground"
                onClick={closeUpload}
                aria-label="업로드 닫기"
                title="닫기"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </Button>
              )}
            </div>
            <div className="mt-3 h-px w-full bg-border" aria-hidden />
          </div>
          )}

          {ready && !previewPanel ? (
            <div
              className={cn(
                "space-y-5",
                flat ? "pt-1" : "px-5 py-5 sm:px-6",
              )}
            >
              <div
                className={cn(
                  "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
                  "grid-rows-[1fr] opacity-100",
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className={cn(
                      flat
                        ? "border-y border-border py-5 sm:py-6"
                        : "space-y-3",
                    )}
                  >
                    <label className="block animate-[bubble-in_280ms_ease-out] motion-reduce:animate-none">
                      <span className="text-sm font-semibold tracking-wide text-muted-2">
                        회의록 제목
                      </span>
                      <input
                        ref={titleInputRef}
                        type="text"
                        value={meetingTitle}
                        disabled={showStarting}
                        placeholder="예: 주간 회의"
                        aria-label="회의록 제목"
                        onChange={(event) => {
                          titleTouchedRef.current = true;
                          setMeetingTitle(event.target.value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          if (demoActive || startDisabled) return;
                          void startMeeting();
                        }}
                        className={cn(
                          "mt-2 h-14 w-full bg-transparent text-lg font-semibold tracking-tight text-foreground outline-none",
                          "border-b border-border placeholder:text-muted-2",
                          "focus:border-foreground disabled:opacity-60",
                        )}
                      />
                    </label>
                    <div className="mt-3 flex min-w-0 items-center gap-3">
                      <span
                        className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-muted"
                        aria-hidden
                      >
                        <FileAudio className="h-5 w-5" strokeWidth={1.75} />
                      </span>
                      <p className="min-w-0 flex-1 truncate text-base tabular-nums text-muted">
                        {awaitingStoreId
                          ? "파일 연결 중…"
                          : [fileSizeLabel, actualMinutes != null ? `약 ${actualMinutes}분` : null]
                              .filter(Boolean)
                              .join(" · ") || "준비됨"}
                      </p>
                      <button
                        type="button"
                        className="inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center px-2 text-base font-semibold text-muted transition-opacity hover:text-foreground hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={showStarting || demoActive}
                        aria-label="파일 바꾸기"
                        title="파일 바꾸기"
                        onClick={() => {
                          if (demoActive) return;
                          clearFile();
                          setStartError(null);
                          resetMeetingTitle();
                        }}
                      >
                        바꾸기
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {!flat ? (
              <div
                className={cn(
                  "flex items-start gap-3 rounded-2xl px-3.5 py-3 sm:px-4",
                  speakerSplitAutomatic
                    ? "bg-primary-soft text-foreground"
                    : "bg-surface text-muted",
                )}
                role="status"
              >
                {speakerSplitAutomatic ? (
                  <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                ) : (
                  <AudioLines className="mt-0.5 h-5 w-5 shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block text-base font-semibold text-foreground">
                    {speakerSplitAutomatic ? "화자 구분 자동" : ANALYSIS_MODE_COPY.standard.label}
                  </span>
                  <span className="mt-0.5 block text-base leading-snug text-muted">
                    {speakerSplitAutomatic
                      ? "프로·팀 플랜과 어드민은 빠른 정리 없이 누가 말했는지 자동으로 나눠 기록합니다."
                      : ANALYSIS_MODE_COPY.standard.benefit}
                  </span>
                  <span className="mt-1 block text-base font-medium tabular-nums text-muted">
                    {speakerSplitAutomatic
                      ? ANALYSIS_MODE_COPY.precision.costHint
                      : ANALYSIS_MODE_COPY.standard.costHint}
                  </span>
                </span>
              </div>
              ) : (
              <p className="text-base text-muted" role="status">
                <span className="tabular-nums">
                  차감 예정{" "}
                  {expectedChargedMinutes != null
                    ? `${expectedChargedMinutes}분`
                    : "—"}
                </span>
                {remainingMinutes != null ? (
                  <span className="tabular-nums">
                    {" "}
                    · 잔여 {remainingMinutes}분
                  </span>
                ) : null}
                {actualMinutes != null &&
                expectedChargedMinutes != null &&
                expectedChargedMinutes !== actualMinutes ? (
                  <span className="tabular-nums">
                    {" "}
                    · 길이 {actualMinutes}분
                  </span>
                ) : null}
              </p>
              )}

              {!flat && actualMinutes != null && expectedChargedMinutes != null ? (
                <p className="px-1 text-base text-muted">
                  <span className="tabular-nums">
                    차감 예정{" "}
                    <span className="font-semibold text-foreground">
                      {expectedChargedMinutes}분
                    </span>
                  </span>
                  {remainingMinutes != null ? (
                    <span className="tabular-nums">
                      {" "}
                      · 잔여 {remainingMinutes}분
                    </span>
                  ) : null}
                  {expectedChargedMinutes !== actualMinutes ? (
                    <span className="tabular-nums">
                      {" "}
                      · 길이 {actualMinutes}분
                    </span>
                  ) : null}
                </p>
              ) : null}

              {resolvedDemo === "error" || startError ? (
                <p
                  className={cn(
                    "text-base font-medium text-masked",
                    flat ? "" : "rounded-2xl bg-masked-soft px-3.5 py-3",
                  )}
                  role="alert"
                >
                  {startError ?? "회의 정리를 시작하지 못했습니다."}
                </p>
              ) : awaitingStoreId ? (
                <p className="text-base font-medium text-muted" role="status">
                  파일을 연결하는 중이에요. 곧 시작할 수 있어요.
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
                  "flex h-14 w-full items-center justify-center gap-2 rounded-[50px] bg-primary px-5 text-base font-semibold tracking-tight text-primary-foreground shadow-soft transition-[opacity,transform,background-color] duration-150",
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
                  "회의 정리 시작"
                )}
              </button>
            </div>
          ) : flat ? (
            <div className="space-y-5">
              <input
                id={fileInputId}
                type="file"
                accept={acceptedFormats.join(",")}
                onChange={handleFileSelect}
                className="sr-only"
                aria-label="오디오 파일 업로드"
              />

              {showUploading ? (
                <div className="flex min-h-[5.5rem] items-center gap-3 border-b border-border py-6 sm:min-h-[6.25rem] sm:py-8">
                  <Loader2
                    className="h-5 w-5 shrink-0 animate-spin text-primary"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-foreground">업로드 중</p>
                    <p className="mt-0.5 truncate text-base text-muted">{fileLabel}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className={cn(
                      "border-y border-border",
                      isDragging && !showRecordingUi && "bg-primary-soft/60",
                    )}
                  >
                    <div
                      className={cn(
                        "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
                        showRecordingUi
                          ? "pointer-events-none grid-rows-[0fr] opacity-0"
                          : "grid-rows-[1fr] opacity-100",
                      )}
                    >
                      <div className="min-h-0 overflow-hidden">
                        <div className="divide-y divide-border">
                          <label
                            htmlFor={fileInputId}
                            className="flex min-h-[5.5rem] cursor-pointer items-center gap-3 py-6 transition-colors hover:bg-surface/70 sm:min-h-[6.25rem] sm:gap-4 sm:py-8"
                          >
                            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted">
                              <Upload className="h-4 w-4" strokeWidth={1.75} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-lg font-semibold tracking-tight text-foreground">
                                파일 업로드
                              </span>
                              <span className="mt-0.5 block text-base text-muted">
                                드래그 앤 드롭 또는 선택 · 최대{" "}
                                {MAX_UPLOAD_AUDIO_MINUTES}분
                              </span>
                            </span>
                          </label>

                          <button
                            type="button"
                            onClick={() => setVaultPickerOpen(true)}
                            className="flex min-h-[5.5rem] w-full cursor-pointer items-center gap-3 py-6 text-left transition-colors hover:bg-surface/70 sm:min-h-[6.25rem] sm:gap-4 sm:py-8"
                          >
                            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted">
                              <Archive className="h-4 w-4" strokeWidth={1.75} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-lg font-semibold tracking-tight text-foreground">
                                보관함
                              </span>
                              <span className="mt-0.5 block text-base text-muted">
                                올려 둔 음성 바로 사용
                              </span>
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {showRecord ? (
                      <div
                        className={cn(
                          !showRecordingUi && "border-t border-border",
                        )}
                      >
                        <div
                          className={cn(
                            "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
                            showRecordingUi
                              ? "grid-rows-[1fr]"
                              : "grid-rows-[0fr]",
                          )}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <div
                              className="flex min-h-[5.5rem] items-center gap-3 py-6 sm:min-h-[6.25rem] sm:gap-4 sm:py-8"
                              role="status"
                              aria-live="polite"
                            >
                              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-foreground">
                                <RecordBeatBars size="md" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
                                  {formatRecordClock(recordElapsedSec)}
                                </p>
                                <p className="mt-0.5 text-base tabular-nums text-muted">
                                  차감 예정 {recordingChargeMinutes}분
                                  {remainingMinutes != null
                                    ? ` · 잔여 ${remainingMinutes}분`
                                    : null}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (demoActive && previewRecording) return;
                                  void toggleBrowserRecord();
                                }}
                                disabled={demoActive && previewRecording}
                                className="inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center px-2 text-base font-semibold text-foreground transition-opacity hover:opacity-70 disabled:cursor-default disabled:opacity-50"
                              >
                                중지
                              </button>
                            </div>
                          </div>
                        </div>

                        {!showRecordingUi ? (
                          <button
                            type="button"
                            onClick={() => void toggleBrowserRecord()}
                            aria-pressed={false}
                            className="flex min-h-[5.5rem] w-full cursor-pointer items-center gap-3 py-6 text-left transition-colors hover:bg-surface/70 sm:min-h-[6.25rem] sm:gap-4 sm:py-8"
                          >
                            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted">
                              <Mic className="h-4 w-4" strokeWidth={1.75} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-lg font-semibold tracking-tight text-foreground">
                                녹음
                              </span>
                              <span className="mt-0.5 block text-base text-muted">
                                브라우저에서 바로 녹음
                              </span>
                            </span>
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {isLive && !demoActive && !hideQuotaBanner ? (
                    <UploadQuotaBanner />
                  ) : null}

                  {uploadStatus === "error" ? (
                    <p className="text-base font-medium text-red-600" role="alert">
                      {uploadError ?? "업로드에 실패했습니다."}
                    </p>
                  ) : null}
                  {recordError ? (
                    <p className="text-base font-medium text-masked" role="alert">
                      {recordError}
                    </p>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div className="space-y-0">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={cn(
                  "relative flex min-h-[188px] w-full flex-col items-center justify-center gap-3 px-6 py-6 transition-colors",
                  showUploading
                    ? "bg-transparent"
                    : isDragging
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
                    <Loader2
                      className="h-6 w-6 animate-spin text-primary"
                      strokeWidth={1.75}
                      aria-hidden
                    />
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
                    {isLive && !demoActive && !hideQuotaBanner ? (
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
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-12 w-12"
                          aria-label="다시 선택"
                          title="다시 선택"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearFile();
                          }}
                        >
                          <RefreshCw className="h-5 w-5" strokeWidth={1.75} />
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
                  {showRecord ? (
                    <div className="mt-2">
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
                          showRecordingUi
                            ? "grid-rows-[1fr]"
                            : "grid-rows-[0fr]",
                        )}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div
                            className="mb-2 flex min-h-14 items-center gap-3 px-1 py-3"
                            role="status"
                            aria-live="polite"
                          >
                            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-foreground">
                              <RecordBeatBars size="md" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-base font-semibold tabular-nums tracking-tight text-foreground">
                                {formatRecordClock(recordElapsedSec)}
                              </p>
                              <p className="mt-0.5 text-base tabular-nums text-muted">
                                차감 예정 {recordingChargeMinutes}분
                                {remainingMinutes != null
                                  ? ` · 잔여 ${remainingMinutes}분`
                                  : null}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (demoActive && previewRecording) return;
                                void toggleBrowserRecord();
                              }}
                              disabled={demoActive && previewRecording}
                              className="inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center px-2 text-base font-semibold text-foreground transition-opacity hover:opacity-70 disabled:cursor-default disabled:opacity-50"
                            >
                              중지
                            </button>
                          </div>
                        </div>
                      </div>
                      {!showRecordingUi ? (
                        <button
                          type="button"
                          onClick={() => void toggleBrowserRecord()}
                          aria-pressed={false}
                          className="flex h-14 w-full cursor-pointer items-center gap-3 bg-transparent px-4 text-left transition-opacity hover:opacity-80"
                        >
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted">
                            <Mic className="h-5 w-5" strokeWidth={1.75} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-base font-semibold text-foreground">
                              녹음하기
                            </span>
                            <span className="mt-0.5 block text-base text-muted">
                              브라우저에서 바로 녹음
                            </span>
                          </span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {recordError ? (
                    <p
                      className="mt-2 px-1 text-base font-medium text-masked"
                      role="alert"
                    >
                      {recordError}
                    </p>
                  ) : null}
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
