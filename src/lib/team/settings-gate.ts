/** 설정 → 팀 운영 진입 게이트 (순수 로직). */

export type TeamSettingsDialogVariant = "no-team" | "feature-off";

export type TeamSettingsGate =
  | { action: "navigate"; href: string }
  | { action: "dialog"; variant: TeamSettingsDialogVariant }
  | { action: "none" };

export type TeamSettingsRowState =
  | { kind: "loading" }
  | { kind: "ready"; href: string }
  | { kind: "needs-team" }
  | { kind: "feature-off" };

export function resolveTeamSettingsRowState(params: {
  featureEnabled: boolean;
  teamCount: number | null;
  hrefWhenReady?: string;
}): TeamSettingsRowState {
  if (!params.featureEnabled) {
    return { kind: "feature-off" };
  }
  if (params.teamCount == null) {
    return { kind: "loading" };
  }
  if (params.teamCount < 1) {
    return { kind: "needs-team" };
  }
  return {
    kind: "ready",
    href: params.hrefWhenReady ?? "/team",
  };
}

export function resolveTeamSettingsGate(params: {
  featureEnabled: boolean;
  teamCount: number;
  /** 팀이 있을 때 이동할 경로. 기본은 팀 메인. */
  hrefWhenReady?: string;
}): TeamSettingsGate {
  const row = resolveTeamSettingsRowState({
    featureEnabled: params.featureEnabled,
    teamCount: params.teamCount,
    hrefWhenReady: params.hrefWhenReady,
  });
  if (row.kind === "feature-off") {
    // 준비중은 회색 비활성만. 팝업은 미리보기용으로만 유지.
    return { action: "none" };
  }
  if (row.kind === "needs-team" || row.kind === "loading") {
    return { action: "dialog", variant: "no-team" };
  }
  return {
    action: "navigate",
    href: row.href,
  };
}

export const TEAM_SETTINGS_DIALOG_COPY: Record<
  TeamSettingsDialogVariant,
  {
    title: string;
    body: string;
    primaryLabel: string;
    primaryHref: string | null;
    secondaryLabel: string;
  }
> = {
  "no-team": {
    title: "팀을 먼저 만들어 주세요",
    body: "팀 운영 정책은 팀이 있어야 설정할 수 있습니다. 팀을 만든 뒤 팀 관리에서 이어가세요.",
    primaryLabel: "팀 만들기",
    primaryHref: "/team",
    secondaryLabel: "닫기",
  },
  "feature-off": {
    title: "팀 설정은 현재 준비 중입니다",
    body: "",
    primaryLabel: "확인",
    primaryHref: null,
    secondaryLabel: "닫기",
  },
};

export const TEAM_SETTINGS_ROW_COPY: Record<
  Exclude<TeamSettingsRowState["kind"], "ready" | "loading">,
  { badge: string; hint: string }
> = {
  "needs-team": {
    badge: "팀 필요",
    hint: "팀을 만들면 마스킹, 보존 정책을 설정할 수 있습니다.",
  },
  "feature-off": {
    badge: "",
    hint: "",
  },
};
