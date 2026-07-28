import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "비밀번호 찾기, Faith",
  description: "가입한 이메일로 Faith 비밀번호 재설정 안내를 받으세요.",
};

export default function ForgotPasswordPage() {
  return (
    <AuthShell contentAlign="raised">
      <ForgotPasswordForm />
    </AuthShell>
  );
}
