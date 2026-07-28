import {
  emailChangeOtpEmailHtml,
  resetPasswordEmailHtml,
  signupOtpEmailHtml,
  signupRequestNoticeEmailHtml,
  welcomeEmailHtml,
} from "@/lib/mail/bodies";
import { appUrl } from "@/lib/mail/shell";

export type MailTemplateId =
  | "signup-otp"
  | "email-change-otp"
  | "password-reset"
  | "welcome"
  | "signup-request-notice";

export type MailTemplateEntry = {
  id: MailTemplateId;
  label: string;
  subject: string;
  description: string;
  render: () => string;
};

const FIXTURE_CODE = "482913";
const FIXTURE_NAME = "홍길동";
const FIXTURE_RESET_URL = `${appUrl()}/reset-password?token=preview-token&email=preview%40example.com`;

/** 현재 구현된 트랜잭션 메일 목록 (프리뷰용). */
export const MAIL_TEMPLATE_CATALOG: MailTemplateEntry[] = [
  {
    id: "signup-otp",
    label: "가입 이메일 인증",
    subject: "[Faith] 이메일 인증번호",
    description: "신규 가입 OTP",
    render: () => signupOtpEmailHtml({ code: FIXTURE_CODE }),
  },
  {
    id: "signup-request-notice",
    label: "로그인 안내",
    subject: "[Faith] 로그인 안내",
    description: "기가입 주소로 OTP 요청 시",
    render: () => signupRequestNoticeEmailHtml(),
  },
  {
    id: "email-change-otp",
    label: "이메일 변경 인증",
    subject: "[Faith] 이메일 변경 인증번호",
    description: "계정 설정에서 이메일 변경 OTP",
    render: () => emailChangeOtpEmailHtml({ code: FIXTURE_CODE }),
  },
  {
    id: "password-reset",
    label: "비밀번호 재설정",
    subject: "[Faith] 비밀번호 재설정",
    description: "비밀번호 찾기 링크",
    render: () => resetPasswordEmailHtml({ resetUrl: FIXTURE_RESET_URL }),
  },
  {
    id: "welcome",
    label: "가입 환영",
    subject: "[Faith] 가입을 환영합니다",
    description: "가입 완료 직후 안내",
    render: () => welcomeEmailHtml({ name: FIXTURE_NAME }),
  },
];
