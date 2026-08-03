/**
 * 디자인 랩 카탈로그.
 * 현재 코드의 제품 컴포넌트만 등록. UI는 제품 파일에서만 수정한다.
 */
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ClipboardList,
  FileAudio,
  FileWarning,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Scale,
  Sparkles,
  Upload,
} from "lucide-react";

import {
  SceneAnimBubbleIn,
  SceneAnimLoadingMark,
  SceneAnimMaskChipIn,
  SceneAnimRecordBeat,
  SceneAnimRunningDots,
} from "@/components/design/scenes/animation-scenes";
import {
  SceneForgotPassword,
  SceneForgotPasswordSent,
  SceneLogin,
  SceneLoginErrorCredentials,
  SceneLoginRegistered,
  SceneResetPassword,
  SceneResetPasswordInvalid,
  SceneSignupAccount,
  SceneSignupEmailVerify,
  SceneSignupEmailVerifyCode,
  SceneSignupEmailVerifyConfirm,
  SceneSignupSocial,
} from "@/components/design/scenes/auth-scenes";
import {
  SceneCreateTeamFirst,
  SceneDuplicateVaultName,
  SceneMaskStylePopup,
  SceneNotificationPanel,
  SceneRecordsDeleteConfirm,
  SceneRecordsDeleteMany,
  SceneRecordsDownloadConfirm,
  SceneTeamSettingsOff,
  SceneVaultPicker,
} from "@/components/design/scenes/dialog-scenes";
import {
  SceneMeetingError,
  SceneMeetingStructuring,
  SceneMeetingTranscribing,
} from "@/components/design/scenes/meeting-process-scenes";
import {
  SceneAttachMenuPopup,
  SceneParticipantsPopup,
  SceneResetConfirmDialog,
  SceneSortControl,
  SceneUserProfileMenu,
} from "@/components/design/scenes/popup-scenes";
import {
  SceneActivityPopupActive,
  SceneActivityPopupEmpty,
  SceneActivityPopupError,
  SceneProcessingMulti,
  SceneProcessingStructuring,
  SceneProcessingTranscribing,
  SceneProcessingWaiting,
  SceneUploadPanel,
  SceneUploadStartError,
  SceneUploadStartFlow,
  SceneUploadStartReady,
  SceneUploadStarting,
  SceneUploadUploading,
} from "@/components/design/scenes/processing-scenes";
import {
  SceneDemandSurveyConsent,
  SceneLegalPolicy,
  SceneLegalPrivacy,
  SceneLegalTerms,
  SceneSurveyCompleted,
  SceneSurveyForm,
} from "@/components/design/scenes/survey-legal-scenes";

export type DesignSceneKind = "trigger" | "popup" | "animation";

export type DesignScene = {
  id: string;
  label: string;
  route?: string;
  kind: DesignSceneKind;
  trigger?: string;
  Preview: ComponentType;
};

export type DesignCategory = {
  id: string;
  label: string;
  icon: LucideIcon;
  scenes: DesignScene[];
};

export const DESIGN_KIND_LABEL: Record<DesignSceneKind, string> = {
  trigger: "트리거",
  popup: "팝업",
  animation: "모션",
};

export const DESIGN_CATEGORIES: DesignCategory[] = [
  {
    id: "auth",
    label: "인증",
    icon: Mail,
    scenes: [
      {
        id: "login",
        label: "로그인",
        route: "/login",
        kind: "trigger",
        Preview: SceneLogin,
      },
      {
        id: "login-registered",
        label: "로그인, 가입 완료",
        route: "/login",
        kind: "trigger",
        Preview: SceneLoginRegistered,
      },
      {
        id: "login-error",
        label: "로그인, 자격 오류",
        route: "/login",
        kind: "trigger",
        Preview: SceneLoginErrorCredentials,
      },
      {
        id: "signup-social",
        label: "회원가입, 소셜",
        route: "/signup",
        kind: "trigger",
        Preview: SceneSignupSocial,
      },
      {
        id: "signup-email-verify",
        label: "이메일 인증",
        route: "/signup",
        kind: "trigger",
        Preview: SceneSignupEmailVerify,
      },
      {
        id: "signup-email-code",
        label: "이메일 인증 확인",
        route: "/signup",
        kind: "trigger",
        Preview: SceneSignupEmailVerifyCode,
      },
      {
        id: "signup-email-confirmed",
        label: "이메일 인증 완료",
        route: "/signup",
        kind: "trigger",
        Preview: SceneSignupEmailVerifyConfirm,
      },
      {
        id: "signup-account",
        label: "계정 정보 입력",
        route: "/signup",
        kind: "trigger",
        Preview: SceneSignupAccount,
      },
      {
        id: "forgot-password",
        label: "비밀번호 찾기",
        route: "/forgot-password",
        kind: "trigger",
        Preview: SceneForgotPassword,
      },
      {
        id: "forgot-password-sent",
        label: "비밀번호 찾기, 발송",
        route: "/forgot-password",
        kind: "trigger",
        Preview: SceneForgotPasswordSent,
      },
      {
        id: "reset-password",
        label: "비밀번호 재설정",
        route: "/reset-password",
        kind: "trigger",
        Preview: SceneResetPassword,
      },
      {
        id: "reset-password-invalid",
        label: "재설정, 링크 무효",
        route: "/reset-password",
        kind: "trigger",
        Preview: SceneResetPasswordInvalid,
      },
    ],
  },
  {
    id: "upload-start",
    label: "올리기, 시작",
    icon: Upload,
    scenes: [
      {
        id: "upload-flow",
        label: "올리기→시작 흐름",
        route: "/dashboard",
        kind: "animation",
        trigger: "AudioUploadZone demoPhase timeline",
        Preview: SceneUploadStartFlow,
      },
      {
        id: "upload-panel",
        label: "올리기 패널",
        route: "/dashboard",
        kind: "trigger",
        trigger: "demoPhase=panel",
        Preview: SceneUploadPanel,
      },
      {
        id: "upload-uploading",
        label: "업로드 중",
        route: "/dashboard",
        kind: "animation",
        trigger: "demoPhase=uploading",
        Preview: SceneUploadUploading,
      },
      {
        id: "upload-ready",
        label: "시작 대기",
        route: "/dashboard",
        kind: "trigger",
        trigger: "demoPhase=ready",
        Preview: SceneUploadStartReady,
      },
      {
        id: "upload-starting",
        label: "시작 중",
        route: "/dashboard",
        kind: "animation",
        trigger: "demoPhase=starting",
        Preview: SceneUploadStarting,
      },
      {
        id: "upload-start-error",
        label: "시작 실패",
        route: "/dashboard",
        kind: "trigger",
        trigger: "demoPhase=error",
        Preview: SceneUploadStartError,
      },
    ],
  },
  {
    id: "processing",
    label: "처리중",
    icon: LayoutDashboard,
    scenes: [
      {
        id: "transcribing",
        label: "받아쓰는 중",
        route: "/dashboard",
        kind: "animation",
        trigger: "ProcessingNowSection animateDemo",
        Preview: SceneProcessingTranscribing,
      },
      {
        id: "waiting",
        label: "분석 대기",
        route: "/dashboard",
        kind: "animation",
        trigger: "ProcessingNowSection waiting",
        Preview: SceneProcessingWaiting,
      },
      {
        id: "structuring",
        label: "정리하는 중",
        route: "/dashboard",
        kind: "animation",
        trigger: "ProcessingNowSection animateDemo",
        Preview: SceneProcessingStructuring,
      },
      {
        id: "multi",
        label: "진행·대기 혼재",
        route: "/dashboard",
        kind: "animation",
        trigger: "ProcessingNowSection animateDemo",
        Preview: SceneProcessingMulti,
      },
    ],
  },
  {
    id: "activity",
    label: "최근 활동",
    icon: Activity,
    scenes: [
      {
        id: "popup-active",
        label: "진행 중",
        route: "헤더",
        kind: "popup",
        trigger: "ProcessingStatusPopup",
        Preview: SceneActivityPopupActive,
      },
      {
        id: "popup-error",
        label: "실패",
        route: "헤더",
        kind: "popup",
        trigger: "ProcessingStatusPopup",
        Preview: SceneActivityPopupError,
      },
      {
        id: "popup-empty",
        label: "비어 있음",
        route: "헤더",
        kind: "popup",
        trigger: "activity=[]",
        Preview: SceneActivityPopupEmpty,
      },
    ],
  },
  {
    id: "meeting-process",
    label: "회의 상세, 처리",
    icon: FileAudio,
    scenes: [
      {
        id: "detail-transcribing",
        label: "받아쓰는 중",
        route: "/meetings/[id]",
        kind: "animation",
        trigger: "MeetingProcessLoader progress",
        Preview: SceneMeetingTranscribing,
      },
      {
        id: "detail-structuring",
        label: "정리하는 중",
        route: "/meetings/[id]",
        kind: "animation",
        trigger: "MeetingProcessLoader progress",
        Preview: SceneMeetingStructuring,
      },
      {
        id: "detail-error",
        label: "실패",
        route: "/meetings/[id]",
        kind: "animation",
        trigger: "phase=error",
        Preview: SceneMeetingError,
      },
    ],
  },
  {
    id: "dialogs",
    label: "확인 다이얼로그",
    icon: FileWarning,
    scenes: [
      {
        id: "vault-duplicate",
        label: "중복 파일명",
        route: "업로드",
        kind: "popup",
        Preview: SceneDuplicateVaultName,
      },
      {
        id: "records-delete",
        label: "기록 삭제",
        route: "목록, 상세",
        kind: "popup",
        Preview: SceneRecordsDeleteConfirm,
      },
      {
        id: "records-delete-many",
        label: "기록 여러 건 삭제",
        route: "목록",
        kind: "popup",
        Preview: SceneRecordsDeleteMany,
      },
      {
        id: "records-download",
        label: "기록 받기",
        route: "목록, 상세",
        kind: "popup",
        Preview: SceneRecordsDownloadConfirm,
      },
      {
        id: "vault-picker",
        label: "보관함에서 선택",
        route: "업로드, 첨부",
        kind: "popup",
        Preview: SceneVaultPicker,
      },
      {
        id: "create-team-first",
        label: "팀 먼저 만들기",
        route: "시스템 설정",
        kind: "popup",
        Preview: SceneCreateTeamFirst,
      },
      {
        id: "team-settings-off",
        label: "팀 설정 준비중",
        route: "시스템 설정",
        kind: "popup",
        Preview: SceneTeamSettingsOff,
      },
    ],
  },
  {
    id: "popups",
    label: "작은 팝업",
    icon: MessageSquare,
    scenes: [
      {
        id: "participants",
        label: "참석자",
        route: "목록",
        kind: "popup",
        Preview: SceneParticipantsPopup,
      },
      {
        id: "attach-menu",
        label: "첨부 메뉴",
        route: "실시간 기록",
        kind: "popup",
        Preview: SceneAttachMenuPopup,
      },
      {
        id: "reset-confirm",
        label: "세션 초기화",
        route: "실시간 기록",
        kind: "popup",
        Preview: SceneResetConfirmDialog,
      },
      {
        id: "user-menu",
        label: "계정 메뉴",
        route: "사이드바",
        kind: "popup",
        Preview: SceneUserProfileMenu,
      },
      {
        id: "sort-control",
        label: "정렬 메뉴",
        route: "목록",
        kind: "popup",
        Preview: SceneSortControl,
      },
      {
        id: "notifications",
        label: "알림 센터, 클릭 펼침",
        route: "헤더",
        kind: "popup",
        Preview: SceneNotificationPanel,
      },
      {
        id: "mask-style",
        label: "가림 방식",
        route: "실시간 기록",
        kind: "popup",
        Preview: SceneMaskStylePopup,
      },
    ],
  },
  {
    id: "survey",
    label: "설문조사",
    icon: ClipboardList,
    scenes: [
      {
        id: "survey-form",
        label: "설문",
        route: "/survey",
        kind: "trigger",
        Preview: SceneSurveyForm,
      },
      {
        id: "survey-completed",
        label: "설문 제출 완료",
        route: "/survey",
        kind: "trigger",
        Preview: SceneSurveyCompleted,
      },
      {
        id: "survey-consent",
        label: "오픈 준비 기간 안내",
        route: "최초 진입",
        kind: "popup",
        trigger: "DemandSurveyConsentGate",
        Preview: SceneDemandSurveyConsent,
      },
    ],
  },
  {
    id: "legal",
    label: "약관",
    icon: Scale,
    scenes: [
      {
        id: "legal-privacy",
        label: "개인정보 처리방침",
        route: "/privacy",
        kind: "trigger",
        Preview: SceneLegalPrivacy,
      },
      {
        id: "legal-terms",
        label: "이용약관",
        route: "/terms",
        kind: "trigger",
        Preview: SceneLegalTerms,
      },
      {
        id: "legal-policy",
        label: "운영정책",
        route: "/policy",
        kind: "trigger",
        Preview: SceneLegalPolicy,
      },
    ],
  },
  {
    id: "animations",
    label: "애니메이션",
    icon: Sparkles,
    scenes: [
      {
        id: "mask-chip-in",
        label: "가림 칩",
        route: "채팅",
        kind: "animation",
        trigger: "mask-chip-in",
        Preview: SceneAnimMaskChipIn,
      },
      {
        id: "bubble-in",
        label: "말풍선",
        route: "채팅",
        kind: "animation",
        trigger: "bubble-in",
        Preview: SceneAnimBubbleIn,
      },
      {
        id: "record-beat",
        label: "녹음 비트",
        route: "실시간 기록",
        kind: "animation",
        trigger: "record-beat",
        Preview: SceneAnimRecordBeat,
      },
      {
        id: "running-dots",
        label: "입력 중 점",
        route: "채팅",
        kind: "animation",
        trigger: "running-dots",
        Preview: SceneAnimRunningDots,
      },
      {
        id: "loading-mark",
        label: "불러오는 중",
        route: "목록",
        kind: "animation",
        trigger: "faith-loading-ring",
        Preview: SceneAnimLoadingMark,
      },
    ],
  },
];

export function findDesignScene(
  catId: string | null | undefined,
  sceneId: string | null | undefined,
): { category: DesignCategory; scene: DesignScene } {
  const category =
    DESIGN_CATEGORIES.find((c) => c.id === catId) ?? DESIGN_CATEGORIES[0]!;
  const scene =
    category.scenes.find((s) => s.id === sceneId) ?? category.scenes[0]!;
  return { category, scene };
}
