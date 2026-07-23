"use client";

import { useSession } from "next-auth/react";
import { useState } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppContext } from "@/context/app-context";
import { cn } from "@/lib/utils";

type Panel = "name" | "email" | "password" | null;

function TextBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="h-10 shrink-0 rounded-full border border-border-strong bg-surface px-3.5 text-sm font-semibold text-foreground hover:bg-surface-2 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function FilledBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-10 shrink-0 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground",
        "hover:bg-primary-hover disabled:opacity-60",
      )}
    >
      {children}
    </button>
  );
}

function FieldLine({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2">
      <p className="w-20 shrink-0 text-sm font-semibold text-foreground">
        {label}
      </p>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2">
        {children}
      </div>
    </div>
  );
}

export function AccountSettings({ children }: { children?: React.ReactNode }) {
  const { currentUser } = useAppContext();
  const { data: session, update } = useSession();
  const hasPassword = Boolean(session?.user?.hasPassword);
  const email = session?.user?.email || currentUser.email;
  const image = session?.user?.image ?? undefined;

  const [panel, setPanel] = useState<Panel>(null);

  const [nameDraft, setNameDraft] = useState("");
  const [nameMsg, setNameMsg] = useState("");
  const [namePending, setNamePending] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [emailStep, setEmailStep] = useState<"form" | "code">("form");
  const [emailMsg, setEmailMsg] = useState("");
  const [emailPending, setEmailPending] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwPending, setPwPending] = useState(false);

  function openPanel(next: Panel) {
    if (panel === next) {
      setPanel(null);
      return;
    }
    if (next === "name") {
      setNameDraft(currentUser.name);
      setNameMsg("");
    }
    if (next === "email") {
      setNewEmail("");
      setOtp("");
      setEmailStep("form");
      setEmailMsg("");
    }
    if (next === "password") {
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setPwMsg("");
    }
    setPanel(next);
  }

  async function saveName() {
    setNameMsg("");
    setNamePending(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameDraft }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setNameMsg(data.message ?? "저장 실패");
        return;
      }
      await update({ name: nameDraft });
      setPanel(null);
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
      setPanel(null);
      setNewEmail("");
      setOtp("");
      setEmailStep("form");
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
      setPanel(null);
    } finally {
      setPwPending(false);
    }
  }

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold leading-none tracking-tight text-foreground">
            계정 설정
          </h1>
        </header>

        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
          <Card className="flex h-full flex-col rounded-3xl shadow-soft">
            <CardHeader className="flex flex-row items-center gap-4 space-y-0 px-6 pb-6 pt-6">
              <Avatar className="h-16 w-16 shrink-0">
                {image ? <AvatarImage src={image} alt="" /> : null}
                <AvatarFallback className="bg-primary-soft text-lg font-semibold text-primary">
                  {currentUser.avatarInitials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-muted">기본 정보</p>
                <CardTitle className="mt-1 text-lg font-semibold tracking-tight">
                  {currentUser.name || "이름 없음"}
                </CardTitle>
                <p className="mt-1 truncate text-sm font-medium text-muted">
                  {email || "이메일 없음"}
                </p>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col px-6 pb-6">
              <div className="space-y-2 rounded-2xl bg-surface p-4">
                <FieldLine label="이름">
                  {panel === "name" ? (
                    <>
                      <Input
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        placeholder="표시 이름"
                        className="h-10 min-w-0 flex-1 rounded-xl bg-card"
                        autoComplete="name"
                      />
                      <FilledBtn
                        disabled={namePending || !nameDraft.trim()}
                        onClick={() => void saveName()}
                      >
                        저장
                      </FilledBtn>
                      <TextBtn onClick={() => setPanel(null)}>취소</TextBtn>
                      <p className="w-full pl-24 text-xs text-muted-2">
                        한글 2~5자
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {currentUser.name || "없음"}
                      </p>
                      <TextBtn onClick={() => openPanel("name")}>변경</TextBtn>
                    </>
                  )}
                </FieldLine>
                {nameMsg ? (
                  <p className="pl-24 text-xs font-medium text-muted">
                    {nameMsg}
                  </p>
                ) : null}

                <FieldLine label="이메일">
                  {panel === "email" ? (
                    <>
                      <Input
                        type="email"
                        placeholder="새 이메일"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        className="h-10 min-w-0 flex-1 rounded-xl bg-card"
                        autoComplete="email"
                      />
                      <FilledBtn
                        disabled={
                          emailPending ||
                          !newEmail.trim() ||
                          (emailStep === "code" && !otp.trim())
                        }
                        onClick={() =>
                          void (emailStep === "code"
                            ? confirmEmail()
                            : requestEmailOtp())
                        }
                      >
                        {emailStep === "code" ? "확인" : "인증"}
                      </FilledBtn>
                      <TextBtn onClick={() => setPanel(null)}>취소</TextBtn>
                    </>
                  ) : (
                    <>
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {email || "없음"}
                      </p>
                      <TextBtn onClick={() => openPanel("email")}>변경</TextBtn>
                    </>
                  )}
                </FieldLine>
                {panel === "email" && emailStep === "code" ? (
                  <div className="pl-24 pt-1">
                    <Input
                      inputMode="numeric"
                      placeholder="인증번호 6자리"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      className="h-10 rounded-xl bg-card"
                      autoComplete="one-time-code"
                    />
                  </div>
                ) : null}
                {emailMsg ? (
                  <p className="pl-24 text-xs font-medium text-muted">
                    {emailMsg}
                  </p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="flex h-full flex-col rounded-3xl shadow-soft">
            <CardHeader className="space-y-1 px-6 pb-6 pt-6">
              <CardTitle className="text-lg font-semibold tracking-tight">
                로그인 방법
              </CardTitle>
              <p className="text-sm font-medium text-muted">
                비밀번호와 연결된 계정
              </p>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-5 px-6 pb-6">
              <div className="rounded-2xl bg-surface p-4">
                <FieldLine label="비밀번호">
                  {panel === "password" ? (
                    <div className="flex w-full min-w-0 flex-col gap-2">
                      {hasPassword ? (
                        <Input
                          type="password"
                          placeholder="현재 비밀번호"
                          autoComplete="current-password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                          className="h-10 rounded-xl bg-card"
                        />
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="password"
                          placeholder="새 비밀번호"
                          autoComplete="new-password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="h-10 min-w-0 flex-1 rounded-xl bg-card"
                        />
                        <Input
                          type="password"
                          placeholder="확인"
                          autoComplete="new-password"
                          value={newPasswordConfirm}
                          onChange={(e) =>
                            setNewPasswordConfirm(e.target.value)
                          }
                          className="h-10 min-w-0 flex-1 rounded-xl bg-card"
                        />
                        <FilledBtn
                          disabled={
                            pwPending ||
                            !newPassword ||
                            !newPasswordConfirm ||
                            (hasPassword && !currentPassword)
                          }
                          onClick={() => void savePassword()}
                        >
                          {hasPassword ? "변경" : "만들기"}
                        </FilledBtn>
                        <TextBtn onClick={() => setPanel(null)}>취소</TextBtn>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {hasPassword ? "사용 중" : "없음"}
                      </p>
                      <TextBtn onClick={() => openPanel("password")}>
                        {hasPassword ? "변경" : "만들기"}
                      </TextBtn>
                    </>
                  )}
                </FieldLine>
                {pwMsg ? (
                  <p className="pl-24 pt-1 text-xs font-medium text-muted">
                    {pwMsg}
                  </p>
                ) : null}
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3">
                <p className="text-sm font-semibold text-foreground">
                  연결된 계정
                </p>
                {children}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
