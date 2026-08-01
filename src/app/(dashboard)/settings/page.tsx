"use client";

import { ChevronRight, Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { CreateTeamFirstDialog } from "@/components/team/create-team-first-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  DEFAULT_ACCOUNT_DISPLAY_PREFS,
  SUMMARY_LANGUAGE_ACTIVE,
  type AccountDisplayPrefs,
  type SummaryLanguage,
} from "@/lib/account-settings";
import { clientGet } from "@/lib/client-fetch";
import {
  DATA_RETENTION_OPTIONS,
  parseDataRetentionDays,
  writeDataRetentionDaysToStorage,
  type DataRetentionDays,
} from "@/lib/data-retention";
import {
  TEAM_FEATURE_ADMIN_ONLY,
  TEAM_FEATURE_ENABLED,
} from "@/lib/feature-flags";
import { buildSupportMailto } from "@/lib/support-email";
import {
  resolveTeamSettingsGate,
  resolveTeamSettingsRowState,
  TEAM_SETTINGS_ROW_COPY,
  type TeamSettingsDialogVariant,
} from "@/lib/team/settings-gate";
import { cn } from "@/lib/utils";

type RetentionPreview = {
  proposedDays: DataRetentionDays;
  willDeleteMeetings: number;
  willDeleteNotifications: number;
};

const CARD_SHADOW =
  "rounded-3xl shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border";

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0 flex-1 pr-3">
        <p className="text-base font-semibold leading-5 text-foreground">
          {label}
        </p>
        {description ? (
          <p className="mt-1 text-base leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

/** M3 switch: 52×32 track, 24 thumb */
function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn(
        "inline-flex h-8 w-[52px] shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        on ? "justify-end bg-primary" : "justify-start bg-surface-2",
      )}
    >
      <span className="block h-6 w-6 rounded-full bg-card shadow-[0_1px_2px_rgba(17,24,46,0.18)]" />
    </button>
  );
}

function Segmented({
  options,
  value,
  onChange,
  ariaLabel,
  disabled,
}: {
  options: { value: string; label: string; disabled?: boolean; badge?: string }[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex max-w-full flex-wrap rounded-xl bg-surface p-1"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled || o.disabled}
          onClick={() => !disabled && !o.disabled && onChange(o.value)}
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            value === o.value
              ? "bg-card text-foreground shadow-soft"
              : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
          {o.badge ? (
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold text-muted">
              {o.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className={CARD_SHADOW}>
      <CardHeader className="space-y-0 px-6 pb-0 pt-6">
        <CardTitle className="text-xl font-bold tracking-tight">
          {title}
        </CardTitle>
        {description ? (
          <p className="mt-1.5 text-base font-medium text-muted">{description}</p>
        ) : null}
        <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
      </CardHeader>
      {children ? (
        <CardContent className="divide-y divide-border px-6 pb-2 pt-1">
          {children}
        </CardContent>
      ) : (
        <div className="px-6 pb-6" />
      )}
    </Card>
  );
}

const RETENTION_LABEL: Record<DataRetentionDays, string> = {
  30: "30일",
  60: "60일",
  90: "90일",
  365: "1년",
};

/** 보존 기간을 줄일 때만 뜨는 확인. 개인 회의 기록 삭제는 비가역이라 미리보기 개수를 보여준다. */
function RetentionConfirmDialog({
  open,
  preview,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  preview: RetentionPreview | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open || !preview) return null;
  const totalDelete = preview.willDeleteMeetings + preview.willDeleteNotifications;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="retention-confirm-title"
        className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-float sm:rounded-3xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="retention-confirm-title"
          className="text-lg font-bold tracking-tight text-foreground"
        >
          {RETENTION_LABEL[preview.proposedDays]}로 줄일까요?
        </h2>
        <p className="mt-2 text-base leading-relaxed text-muted">
          {totalDelete > 0
            ? `지금 바로 회의 기록 ${preview.willDeleteMeetings}개, 알림 ${preview.willDeleteNotifications}개가 삭제됩니다. 삭제 후 복구할 수 없습니다.`
            : "지금 삭제되는 기록은 없습니다. 이후 기간이 지난 기록부터 삭제됩니다."}
        </p>
        <p className="mt-3 rounded-xl bg-surface px-3.5 py-3 text-sm leading-relaxed text-muted">
          감사 로그(활동 기록)는 법령상 최소 2년 보관되며 이 설정과 무관합니다.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl px-5 text-base font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-masked px-5 text-base font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {totalDelete > 0 ? "삭제하고 줄이기" : "줄이기"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const {
    autoOpenTimelineOnStart,
    currentUser,
    setAutoOpenTimelineOnStart,
    setWorkspaceId,
  } = useAppContext();
  const { scenarioId } = usePageUxPreview();

  const [prefs, setPrefs] = useState<AccountDisplayPrefs>(
    DEFAULT_ACCOUNT_DISPLAY_PREFS,
  );
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [prefsSaveError, setPrefsSaveError] = useState<string | null>(null);

  const [retention, setRetention] = useState<DataRetentionDays>(90);
  const [retentionLoaded, setRetentionLoaded] = useState(false);
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [retentionPreview, setRetentionPreview] =
    useState<RetentionPreview | null>(null);

  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [teamGateBusy, setTeamGateBusy] = useState(false);
  const [teamDialogVariant, setTeamDialogVariant] =
    useState<TeamSettingsDialogVariant | null>(null);

  const previewTeamDialog: TeamSettingsDialogVariant | null =
    scenarioId === "popup-create-team-first"
      ? "no-team"
      : scenarioId === "popup-team-settings-off"
        ? "feature-off"
        : null;
  const dialogVariant = previewTeamDialog ?? teamDialogVariant;
  const dialogOpen = Boolean(dialogVariant);

  const previewRowKind =
    scenarioId === "popup-create-team-first"
      ? ("needs-team" as const)
      : scenarioId === "popup-team-settings-off"
        ? ("feature-off" as const)
        : null;
  const teamFeatureForUser =
    TEAM_FEATURE_ENABLED &&
    (!TEAM_FEATURE_ADMIN_ONLY || currentUser.tier === "ADMIN");
  const teamRow = previewRowKind
    ? previewRowKind === "needs-team"
      ? ({ kind: "needs-team" } as const)
      : ({ kind: "feature-off" } as const)
    : resolveTeamSettingsRowState({
        featureEnabled: teamFeatureForUser,
        teamCount,
        hrefWhenReady: "/team",
      });
  const teamRowUnavailable =
    teamRow.kind === "needs-team" || teamRow.kind === "feature-off";
  const teamRowHint =
    teamRow.kind === "needs-team" || teamRow.kind === "feature-off"
      ? TEAM_SETTINGS_ROW_COPY[teamRow.kind]
      : null;

  useEffect(() => {
    if (!teamFeatureForUser) {
      setTeamCount(0);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await clientGet("/api/teams");
        const data = (await response.json()) as {
          ok?: boolean;
          teams?: unknown[];
        };
        if (!cancelled && data.ok) {
          setTeamCount(Array.isArray(data.teams) ? data.teams.length : 0);
        } else if (!cancelled) {
          setTeamCount(0);
        }
      } catch {
        if (!cancelled) setTeamCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamFeatureForUser]);

  async function openTeamSettings() {
    if (previewTeamDialog) return;
    if (teamRow.kind === "feature-off" || teamRow.kind === "loading") return;
    if (teamRow.kind === "needs-team") {
      setTeamDialogVariant("no-team");
      return;
    }
    setTeamGateBusy(true);
    try {
      let count = teamCount;
      if (count == null) {
        const response = await clientGet("/api/teams");
        const data = (await response.json()) as {
          ok?: boolean;
          teams?: unknown[];
        };
        count = data.ok && Array.isArray(data.teams) ? data.teams.length : 0;
        setTeamCount(count);
      }
      const gate = resolveTeamSettingsGate({
        featureEnabled: TEAM_FEATURE_ENABLED,
        teamCount: count,
        hrefWhenReady: "/team",
      });
      if (gate.action === "none") return;
      if (gate.action === "dialog") {
        setTeamDialogVariant(gate.variant);
        return;
      }
      setWorkspaceId("team");
      router.push(gate.href);
    } catch {
      if (TEAM_FEATURE_ENABLED) setTeamDialogVariant("no-team");
    } finally {
      setTeamGateBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/settings", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data?.ok) {
          setPrefs({
            autoMask: Boolean(data.autoMask),
            speakerSplit: Boolean(data.speakerSplit),
            summaryLang: data.summaryLang === "en" ? "en" : "ko",
            realtimeInvitePolicy:
              data.realtimeInvitePolicy === "reject" ? "reject" : "allow",
          });
        }
      } catch {
        // 기본값 유지
      } finally {
        if (!cancelled) setPrefsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/data-retention", {
          cache: "no-store",
        });
        const data = await res.json();
        if (!cancelled && data?.ok) {
          const days = parseDataRetentionDays(data.currentDays);
          setRetention(days);
          writeDataRetentionDaysToStorage(days);
        }
      } catch {
        // 기본값 유지
      } finally {
        if (!cancelled) setRetentionLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const savePrefs = useCallback(
    (patch: Partial<AccountDisplayPrefs>, previous: AccountDisplayPrefs) => {
      setPrefsSaveError(null);
      void (async () => {
        try {
          const res = await fetch("/api/account/settings", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(patch),
          });
          const data = (await res.json()) as { ok?: boolean };
          if (!res.ok || !data.ok) {
            setPrefs(previous);
            setPrefsSaveError("저장되지 않았습니다. 다시 시도해 주세요.");
          }
        } catch {
          setPrefs(previous);
          setPrefsSaveError("저장되지 않았습니다. 다시 시도해 주세요.");
        }
      })();
    },
    [],
  );

  function updateAutoMask(next: boolean) {
    setPrefs((prev) => {
      const previous = prev;
      const updated = { ...prev, autoMask: next };
      savePrefs({ autoMask: next }, previous);
      return updated;
    });
  }

  function updateSummaryLang(next: string) {
    if (next !== SUMMARY_LANGUAGE_ACTIVE) return;
    const lang = next as SummaryLanguage;
    setPrefs((prev) => {
      const previous = prev;
      const updated = { ...prev, summaryLang: lang };
      savePrefs({ summaryLang: lang }, previous);
      return updated;
    });
  }

  function updateRealtimeInvitePolicy(next: string) {
    if (next !== "allow" && next !== "reject") return;
    setPrefs((prev) => {
      const previous = prev;
      const updated = {
        ...prev,
        realtimeInvitePolicy: next as AccountDisplayPrefs["realtimeInvitePolicy"],
      };
      savePrefs({ realtimeInvitePolicy: updated.realtimeInvitePolicy }, previous);
      return updated;
    });
  }

  async function handleRetentionChange(nextRaw: string) {
    const next = parseDataRetentionDays(nextRaw);
    if (next === retention) return;
    if (next > retention) {
      setRetention(next);
      writeDataRetentionDaysToStorage(next);
      await fetch("/api/account/data-retention", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: next }),
      }).catch(() => {});
      return;
    }
    try {
      const res = await fetch(
        `/api/account/data-retention?days=${next}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (data?.ok) {
        setRetentionPreview({
          proposedDays: next,
          willDeleteMeetings: data.willDeleteMeetings ?? 0,
          willDeleteNotifications: data.willDeleteNotifications ?? 0,
        });
      }
    } catch {
      // 미리보기 실패 시 변경 시도하지 않음(데이터 손실 안내 없이 줄이지 않는다)
    }
  }

  async function confirmRetentionChange() {
    if (!retentionPreview) return;
    setRetentionBusy(true);
    try {
      const res = await fetch("/api/account/data-retention", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: retentionPreview.proposedDays }),
      });
      const data = await res.json();
      if (data?.ok) {
        setRetention(parseDataRetentionDays(data.days));
        writeDataRetentionDaysToStorage(parseDataRetentionDays(data.days));
      }
    } finally {
      setRetentionBusy(false);
      setRetentionPreview(null);
    }
  }

  return (
    <PageContainer soft>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
            시스템 설정
          </h1>
        </header>

        {prefsSaveError ? (
          <p className="text-base font-medium text-red-600" role="alert">
            {prefsSaveError}
          </p>
        ) : null}

        <SettingsSection
          title="개인 기록 기본값"
          description="개인 워크스페이스 회의에만 적용됩니다."
        >
          <SettingRow
            label="자동 마스킹"
            description="개인 회의 기록을 열 때 개인정보를 기본으로 마스킹합니다."
          >
            <Toggle
              label="개인 자동 마스킹"
              on={prefs.autoMask}
              onChange={updateAutoMask}
              disabled={!prefsLoaded}
            />
          </SettingRow>
          <SettingRow
            label="회의 시작 시 타임라인 열기"
            description="녹음(인식)을 시작하면 타임라인 패널을 열린 상태로 시작합니다."
          >
            <Toggle
              label="회의 시작 시 타임라인 열기"
              on={autoOpenTimelineOnStart}
              onChange={setAutoOpenTimelineOnStart}
            />
          </SettingRow>
          <SettingRow
            label="요약 언어"
            description="자동 요약, 타임라인에 사용할 기본 언어입니다."
          >
            <Segmented
              ariaLabel="요약 언어"
              value={prefs.summaryLang}
              onChange={updateSummaryLang}
              disabled={!prefsLoaded}
              options={[
                { value: "ko", label: "한국어" },
                { value: "en", label: "English", disabled: true, badge: "준비중" },
              ]}
            />
          </SettingRow>
          <SettingRow
            label="개인 실시간 초대"
            description="다른 회원이 개인 공동 실시간 회의에 초대할 수 있는지 정합니다. 거부하면 새 초대가 자동으로 막힙니다."
          >
            <Segmented
              ariaLabel="개인 실시간 초대"
              value={prefs.realtimeInvitePolicy}
              onChange={updateRealtimeInvitePolicy}
              disabled={!prefsLoaded}
              options={[
                { value: "allow", label: "허용" },
                { value: "reject", label: "거부" },
              ]}
            />
          </SettingRow>
          <SettingRow
            label="회의 기록, 알림 보존 기간"
            description="이 기간이 지난 개인 회의 기록과 알림은 삭제됩니다. 감사 로그(활동 기록)는 법령상 최소 2년 보관되며 이 설정과 무관합니다."
          >
            <Segmented
              ariaLabel="회의 기록, 알림 보존 기간"
              value={String(retention)}
              onChange={handleRetentionChange}
              disabled={!retentionLoaded || retentionBusy}
              options={DATA_RETENTION_OPTIONS.map((days) => ({
                value: String(days),
                label: RETENTION_LABEL[days],
              }))}
            />
          </SettingRow>
          <SettingRow
            label="개인정보 열람, 정정, 삭제 요청"
            description="처리 중인 개인정보의 열람, 정정, 삭제를 요청합니다."
          >
            <a
              href={buildSupportMailto({ subject: "개인정보 열람, 정정, 삭제 요청" })}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft"
            >
              <Mail className="h-4 w-4" strokeWidth={1.75} />
              요청하기
            </a>
          </SettingRow>
        </SettingsSection>

        {teamRow.kind === "feature-off" ? (
          <SettingsSection
            title={
              TEAM_FEATURE_ENABLED && TEAM_FEATURE_ADMIN_ONLY
                ? "팀 기능은 관리자에게만 제공됩니다"
                : "팀 설정은 현재 준비 중입니다"
            }
            description={
              TEAM_FEATURE_ENABLED && TEAM_FEATURE_ADMIN_ONLY
                ? "안정화 기간에는 관리자 계정만 팀 공간과 팀 운영 정책을 사용할 수 있습니다."
                : undefined
            }
          />
        ) : (
          <SettingsSection
            title="팀 운영 정책"
            description="팀 워크스페이스 마스킹, 보존 정책은 팀 관리 화면에서 설정합니다."
          >
            <button
              type="button"
              onClick={() => void openTeamSettings()}
              disabled={teamGateBusy || teamRow.kind === "loading"}
              className={cn(
                "flex w-full items-center justify-between gap-3 rounded-2xl px-1 py-3.5 text-left transition-colors",
                teamRow.kind === "loading"
                  ? "cursor-not-allowed opacity-55"
                  : teamRow.kind === "needs-team"
                    ? "cursor-pointer opacity-70 hover:bg-surface-2/60"
                    : "cursor-pointer hover:bg-surface-2/60",
                teamGateBusy && "cursor-wait opacity-70",
              )}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p
                    className={cn(
                      "text-base font-semibold leading-5",
                      teamRowUnavailable ? "text-muted" : "text-foreground",
                    )}
                  >
                    팀 관리로 이동
                  </p>
                  {teamRowHint?.badge ? (
                    <span className="inline-flex min-h-7 items-center rounded-full bg-surface-2 px-2 text-sm font-semibold text-muted">
                      {teamRowHint.badge}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-base leading-relaxed text-muted">
                  {teamRowHint
                    ? teamRowHint.hint
                    : "자동 마스킹, 마스킹 정책 강제, 회의 보관 기간은 팀별로 팀 관리에서 정합니다."}
                </p>
              </div>
              {teamGateBusy || teamRow.kind === "loading" ? (
                <Loader2
                  className="h-5 w-5 shrink-0 animate-spin text-muted-2"
                  strokeWidth={1.75}
                  aria-hidden
                />
              ) : (
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-muted-2"
                  strokeWidth={1.75}
                />
              )}
            </button>
          </SettingsSection>
        )}
      </div>

      <RetentionConfirmDialog
        open={Boolean(retentionPreview)}
        preview={retentionPreview}
        busy={retentionBusy}
        onCancel={() => setRetentionPreview(null)}
        onConfirm={() => void confirmRetentionChange()}
      />

      <CreateTeamFirstDialog
        open={dialogOpen}
        variant={dialogVariant ?? "no-team"}
        onClose={() => {
          if (previewTeamDialog) return;
          setTeamDialogVariant(null);
        }}
      />
    </PageContainer>
  );
}
