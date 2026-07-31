/**
 * 개인 회의 기록 기본값. `UserPersonalSettings.displayPrefs`(Json) 안에 저장한다.
 * 서버(API 라우트, STT 파이프라인)와 클라이언트가 같은 파서를 써야 값이 어긋나지 않는다.
 */

export const SUMMARY_LANGUAGES = ["ko", "en"] as const;
export type SummaryLanguage = (typeof SUMMARY_LANGUAGES)[number];

/** 현재 실제로 지원하는 언어. en은 UI·API 모두 준비중(강제 ko). */
export const SUMMARY_LANGUAGE_ACTIVE: SummaryLanguage = "ko";

export const REALTIME_INVITE_POLICIES = ["allow", "reject"] as const;
export type RealtimeInvitePolicy = (typeof REALTIME_INVITE_POLICIES)[number];

export type AccountDisplayPrefs = {
  /** 회의 기록을 열 때 기본으로 개인정보를 가릴지. */
  autoMask: boolean;
  /** 업로드 분석 시 화자 분리 단계를 실행할지. */
  speakerSplit: boolean;
  /** 요약/타임라인 기본 언어. */
  summaryLang: SummaryLanguage;
  /** 개인 공동 실시간 초대를 받을지. */
  realtimeInvitePolicy: RealtimeInvitePolicy;
};

export const DEFAULT_ACCOUNT_DISPLAY_PREFS: AccountDisplayPrefs = {
  autoMask: true,
  speakerSplit: true,
  summaryLang: "ko",
  realtimeInvitePolicy: "allow",
};

export function parseAccountDisplayPrefs(raw: unknown): AccountDisplayPrefs {
  if (typeof raw !== "object" || raw === null) {
    return DEFAULT_ACCOUNT_DISPLAY_PREFS;
  }
  const obj = raw as Record<string, unknown>;
  return {
    autoMask:
      typeof obj.autoMask === "boolean"
        ? obj.autoMask
        : DEFAULT_ACCOUNT_DISPLAY_PREFS.autoMask,
    speakerSplit:
      typeof obj.speakerSplit === "boolean"
        ? obj.speakerSplit
        : DEFAULT_ACCOUNT_DISPLAY_PREFS.speakerSplit,
    summaryLang:
      typeof obj.summaryLang === "string" &&
      SUMMARY_LANGUAGES.includes(obj.summaryLang as SummaryLanguage)
        ? (obj.summaryLang as SummaryLanguage)
        : DEFAULT_ACCOUNT_DISPLAY_PREFS.summaryLang,
    realtimeInvitePolicy:
      typeof obj.realtimeInvitePolicy === "string" &&
      REALTIME_INVITE_POLICIES.includes(
        obj.realtimeInvitePolicy as RealtimeInvitePolicy,
      )
        ? (obj.realtimeInvitePolicy as RealtimeInvitePolicy)
        : DEFAULT_ACCOUNT_DISPLAY_PREFS.realtimeInvitePolicy,
  };
}
