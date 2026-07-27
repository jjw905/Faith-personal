import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "비밀번호 재설정 · Faith",
  description: "새 비밀번호를 설정합니다.",
};

export default function ResetPasswordPage() {
  return (
    <AuthShell contentAlign="raised">
      <Suspense fallback={<p className="text-base text-muted">불러오는 중…</p>}>
        <ResetPasswordForm />
      </Suspense>
    </AuthShell>
  );
}
