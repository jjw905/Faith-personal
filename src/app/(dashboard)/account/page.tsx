"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { PageContainer } from "@/components/layout/page-container";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppContext } from "@/context/app-context";
import { cn } from "@/lib/utils";

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
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-1 last:pb-1">
      <div className="min-w-0 flex-1 pr-3">
        <p className="text-sm font-medium leading-5 text-foreground">{label}</p>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

export default function AccountPage() {
  const { currentUser } = useAppContext();
  const { data: session, update } = useSession();
  const hasPassword = Boolean(session?.user?.hasPassword);

  const [name, setName] = useState(currentUser.name);
  const [nameMsg, setNameMsg] = useState("");
  const [namePending, setNamePending] = useState(false);

  useEffect(() => {
    setName(currentUser.name);
  }, [currentUser.name]);

  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [emailStep, setEmailStep] = useState<"idle" | "code">("idle");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailPending, setEmailPending] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwPending, setPwPending] = useState(false);

  async function saveName() {
    setNameMsg("");
    setNamePending(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setNameMsg(data.message ?? "저장 실패");
        return;
      }
      await update({ name });
      setNameMsg("저장되었습니다.");
    } finally {
      setNamePending(false);
    }
  }

  async function requestEmailOtp() {
    setEmailMsg("");
    setEmailPending(true);
    try {
      const res = await fetch("/api/account/email/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim().toLowerCase() }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setEmailMsg(data.message ?? "발송 실패");
        return;
      }
      setEmailStep("code");
      setEmailMsg("인증번호를 발송했습니다.");
    } finally {
      setEmailPending(false);
    }
  }

  async function confirmEmail() {
    setEmailMsg("");
    setEmailPending(true);
    try {
      const res = await fetch("/api/account/email/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail.trim().toLowerCase(),
          code: otp.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setEmailMsg(data.message ?? "인증 실패");
        return;
      }
      await update();
      setEmailStep("idle");
      setNewEmail("");
      setOtp("");
      setEmailMsg("이메일이 변경되었습니다.");
    } finally {
      setEmailPending(false);
    }
  }

  async function savePassword() {
    setPwMsg("");
    setPwPending(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          newPasswordConfirm,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setPwMsg(data.message ?? "변경 실패");
        return;
      }
      await update();
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPwMsg("비밀번호가 변경되었습니다.");
    } finally {
      setPwPending(false);
    }
  }

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold leading-none tracking-tight text-foreground">
            계정 설정
          </h1>
        </header>

        <Card>
          <CardHeader className="space-y-2 px-5 pb-2 pt-5 sm:px-6">
            <CardTitle className="text-lg">프로필</CardTitle>
            <p className="text-sm leading-relaxed text-muted">
              표시 이름을 변경합니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5 sm:px-6">
            <SettingRow label="이름">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 w-48"
              />
            </SettingRow>
            <div className="flex items-center justify-end gap-3">
              {nameMsg ? (
                <p className="text-xs text-muted">{nameMsg}</p>
              ) : null}
              <button
                type="button"
                disabled={namePending}
                onClick={() => void saveName()}
                className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
              >
                저장
              </button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2 px-5 pb-2 pt-5 sm:px-6">
            <CardTitle className="text-lg">계정 정보</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border px-5 pb-4 pt-0 sm:px-6">
            <SettingRow label="현재 이메일">
              <span className="max-w-[220px] truncate text-sm text-foreground">
                {session?.user?.email || currentUser.email}
              </span>
            </SettingRow>
            <div className="space-y-3 py-3.5">
              <p className="text-sm font-medium text-foreground">이메일 변경</p>
              <Input
                type="email"
                placeholder="새 이메일"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="h-10"
              />
              {emailStep === "code" ? (
                <Input
                  inputMode="numeric"
                  placeholder="인증번호 6자리"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="h-10"
                />
              ) : null}
              <div className="flex items-center justify-end gap-3">
                {emailMsg ? (
                  <p className="text-xs text-muted">{emailMsg}</p>
                ) : null}
                <button
                  type="button"
                  disabled={emailPending}
                  onClick={() =>
                    void (emailStep === "code" ? confirmEmail() : requestEmailOtp())
                  }
                  className={cn(
                    "h-10 rounded-xl px-4 text-sm font-semibold",
                    "bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-60",
                  )}
                >
                  {emailStep === "code" ? "인증 확인" : "인증번호 받기"}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2 px-5 pb-2 pt-5 sm:px-6">
            <CardTitle className="text-lg">비밀번호</CardTitle>
            <p className="text-sm leading-relaxed text-muted">
              {hasPassword
                ? "현재 비밀번호 확인 후 변경합니다."
                : "소셜 가입 계정입니다. 비밀번호를 새로 설정할 수 있습니다."}
            </p>
          </CardHeader>
          <CardContent className="space-y-3 px-5 pb-5 sm:px-6">
            {hasPassword ? (
              <Input
                type="password"
                placeholder="현재 비밀번호"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-10"
              />
            ) : null}
            <Input
              type="password"
              placeholder="새 비밀번호"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-10"
            />
            <Input
              type="password"
              placeholder="새 비밀번호 확인"
              autoComplete="new-password"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              className="h-10"
            />
            <div className="flex items-center justify-end gap-3">
              {pwMsg ? <p className="text-xs text-muted">{pwMsg}</p> : null}
              <button
                type="button"
                disabled={pwPending}
                onClick={() => void savePassword()}
                className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
              >
                {hasPassword ? "비밀번호 변경" : "비밀번호 설정"}
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
