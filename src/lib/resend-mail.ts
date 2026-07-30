import { Resend } from "resend";

import {
  appUrl,
  emailChangeOtpEmailHtml,
  emailChangedNoticeEmailHtml,
  isMailAppUrlSafe,
  resetPasswordEmailHtml,
  signupOtpEmailHtml,
  signupRequestNoticeEmailHtml,
  welcomeEmailHtml,
} from "@/lib/mail";

function fromAddress() {
  return process.env.AUTH_EMAIL_FROM || "Faith <onboarding@resend.dev>";
}

/** Resend 키 여부. */
export function isResendConfigured() {
  return Boolean(process.env.AUTH_RESEND_KEY?.trim());
}

async function send(params: { to: string; subject: string; html: string }) {
  if (!isMailAppUrlSafe()) {
    console.error(
      "[resend] refusing mail: AUTH_URL/app base is localhost or invalid in production",
      appUrl(),
    );
    return { ok: false as const, reason: "invalid_app_url" as const };
  }
  const key = process.env.AUTH_RESEND_KEY;
  if (!key) {
    return { ok: false as const, reason: "missing_key" as const };
  }
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: fromAddress(),
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
  if (error) {
    console.error("[resend] send failed", error);
    return { ok: false as const, reason: "send_failed" };
  }
  return { ok: true as const };
}

/** 회원가입, 이메일 인증용 6자리 인증번호 */
export async function sendSignupOtp(email: string, code: string) {
  return send({
    to: email,
    subject: "[Faith] 이메일 인증번호",
    html: signupOtpEmailHtml({ code }),
  });
}

/** 기가입 주소로 가입 OTP 요청 시 — 로그인 안내 (UI는 동일하게 보냄) */
export async function sendSignupRequestNotice(email: string) {
  return send({
    to: email,
    subject: "[Faith] 로그인 안내",
    html: signupRequestNoticeEmailHtml(),
  });
}

/** 이메일 변경용 6자리 인증번호 */
export async function sendEmailChangeOtp(email: string, code: string) {
  return send({
    to: email,
    subject: "[Faith] 이메일 변경 인증번호",
    html: emailChangeOtpEmailHtml({ code }),
  });
}

/** 이메일 변경 완료 — 기존 주소 알림 (OWASP) */
export async function sendEmailChangedNotice(
  oldEmail: string,
  newEmail: string,
) {
  return send({
    to: oldEmail,
    subject: "[Faith] 계정 이메일이 변경되었습니다",
    html: emailChangedNoticeEmailHtml({ newEmail }),
  });
}

/** 가입 완료 안내 (실패해도 가입은 유지) */
export async function sendWelcomeEmail(email: string, name?: string | null) {
  return send({
    to: email,
    subject: "[Faith] 가입을 환영합니다",
    html: welcomeEmailHtml({ name }),
  });
}

/** 비밀번호 재설정 링크 */
export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  return send({
    to: email,
    subject: "[Faith] 비밀번호 재설정",
    html: resetPasswordEmailHtml({ resetUrl }),
  });
}
