import { Resend } from "resend";

import {
  appUrl,
  otpEmailHtml,
  resetPasswordEmailHtml,
} from "@/lib/mail-templates";

function fromAddress() {
  return process.env.AUTH_EMAIL_FROM || "Faith <onboarding@resend.dev>";
}

/** Resend 키 여부. */
export function isResendConfigured() {
  return Boolean(process.env.AUTH_RESEND_KEY?.trim());
}

async function send(params: { to: string; subject: string; html: string }) {
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

/** 이메일 변경용 6자리 인증번호 */
export async function sendEmailChangeOtp(email: string, code: string) {
  return send({
    to: email,
    subject: "[Faith] 이메일 변경 인증번호",
    html: otpEmailHtml({
      title: "이메일 변경 인증",
      intro: "계정 이메일을 변경하려면 아래 인증번호를 입력해 주세요.",
      code,
    }),
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
