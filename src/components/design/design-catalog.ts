/**
 * 디자인 랩 카탈로그.
 * 현재 코드의 제품 컴포넌트만 등록. UI는 제품 파일에서만 수정한다.
 */
import type { ComponentType } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  FileAudio,
  FileWarning,
  LayoutDashboard,
  Mail,
  MessageSquare,
  Sparkles,
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
  SceneDuplicateVaultName,
  SceneMaskStylePopup,
  SceneNotificationPanel,
  SceneRecordsDeleteConfirm,
  SceneRecordsDeleteMany,
  SceneRecordsDownloadConfirm,
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
} from "@/components/design/scenes/processing-scenes";

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
    id: "processing",
    label: "처리중",
    icon: LayoutDashboard,
    scenes: [
      {
        id: "transcribing",
        label: "받아쓰는 중",
        route: "/dashboard",
        kind: "trigger",
        trigger: "phase=transcribing",
        Preview: SceneProcessingTranscribing,
      },
      {
        id: "structuring",
        label: "정리하는 중",
        route: "/dashboard",
        kind: "trigger",
        trigger: "phase=structuring",
        Preview: SceneProcessingStructuring,
      },
      {
        id: "multi",
        label: "여러 건 동시",
        route: "/dashboard",
        kind: "trigger",
        trigger: "active 2건",
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
        kind: "trigger",
        trigger: "MeetingProcessLoader",
        Preview: SceneMeetingTranscribing,
      },
      {
        id: "detail-structuring",
        label: "정리하는 중",
        route: "/meetings/[id]",
        kind: "trigger",
        trigger: "MeetingProcessLoader",
        Preview: SceneMeetingStructuring,
      },
      {
        id: "detail-error",
        label: "실패",
        route: "/meetings/[id]",
        kind: "trigger",
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
