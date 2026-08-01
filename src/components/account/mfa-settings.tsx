"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type MfaStatus = {
  enabled: boolean;
  hasPassword: boolean;
  recoveryCodeCount: number;
};

type MfaSetup = {
  secret: string;
  otpauthUri: string;
  qrCodeDataUrl: string;
};

type Mode = "idle" | "setup" | "recovery" | "disable";

export function MfaSettings() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/account/mfa", { cache: "no-store" });
    const data = (await response.json()) as {
      ok?: boolean;
      status?: MfaStatus;
      message?: string;
    };
    if (!response.ok || !data.ok || !data.status) {
      throw new Error(data.message ?? "MFA 상태를 불러오지 못했습니다.");
    }
    setStatus(data.status);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void loadStatus().catch((error: unknown) => {
        setMessage(
          error instanceof Error
            ? error.message
            : "MFA 상태를 불러오지 못했습니다.",
        );
      });
    });
  }, [loadStatus]);

  function resetFlow() {
    setMode("idle");
    setSetup(null);
    setRecoveryCodes([]);
    setCode("");
  }

  async function startSetup() {
    setMessage("");
    setPending(true);
    try {
      const response = await fetch("/api/account/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setup" }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        setup?: MfaSetup;
        message?: string;
      };
      if (!response.ok || !data.ok || !data.setup) {
        throw new Error(data.message ?? "MFA 설정을 시작하지 못했습니다.");
      }
      setSetup(data.setup);
      setMode("setup");
      setCode("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "MFA 설정을 시작하지 못했습니다.",
      );
    } finally {
      setPending(false);
    }
  }

  async function submitCode(action: "confirm" | "disable") {
    setMessage("");
    setPending(true);
    try {
      const response = await fetch("/api/account/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, code }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        recoveryCodes?: string[];
        message?: string;
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? "MFA 요청을 처리하지 못했습니다.");
      }
      if (action === "confirm") {
        setRecoveryCodes(data.recoveryCodes ?? []);
        setMode("recovery");
        setCode("");
        await loadStatus();
      } else {
        resetFlow();
        await loadStatus();
        setMessage("MFA를 해제했습니다.");
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "MFA 요청을 처리하지 못했습니다.",
      );
    } finally {
      setPending(false);
    }
  }

  async function copyRecoveryCodes() {
    try {
      await navigator.clipboard.writeText(recoveryCodes.join("\n"));
      setMessage("복구 코드를 클립보드에 복사했습니다.");
    } catch {
      setMessage("복사하지 못했습니다. 화면의 코드를 안전한 곳에 저장하세요.");
    }
  }

  return (
    <Card className="rounded-3xl shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border">
      <CardHeader className="space-y-0 px-6 pb-0 pt-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary" aria-hidden />
          <CardTitle className="text-xl font-bold tracking-tight">
            2단계 인증 (MFA)
          </CardTitle>
        </div>
        <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="space-y-5 px-6 pb-6 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-foreground">
              {status?.enabled ? "인증 앱 사용 중" : "인증 앱 미설정"}
            </p>
            <p className="mt-1 text-base leading-6 text-muted">
              로그인할 때 비밀번호와 인증 앱 코드를 함께 확인합니다.
            </p>
          </div>
          {status ? (
            <span
              className={cn(
                "inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold",
                status.enabled
                  ? "bg-success-soft text-success"
                  : "bg-surface-2 text-muted",
              )}
            >
              {status.enabled ? "보호 중" : "설정 필요"}
            </span>
          ) : (
            <span className="text-base text-muted">불러오는 중…</span>
          )}
        </div>

        {mode === "idle" && status?.enabled ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface-2 p-4">
            <p className="text-base leading-6 text-muted">
              남은 복구 코드 {status.recoveryCodeCount}개. 복구 코드는 다시
              표시되지 않으므로 안전하게 보관하세요.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="min-h-12 rounded-xl text-base"
              onClick={() => {
                setMessage("");
                setMode("disable");
              }}
            >
              MFA 끄기
            </Button>
          </div>
        ) : null}

        {mode === "idle" && status && !status.enabled ? (
          status.hasPassword ? (
            <Button
              type="button"
              className="min-h-12 rounded-xl text-base"
              disabled={pending}
              onClick={() => void startSetup()}
            >
              {pending ? "준비 중…" : "인증 앱 설정 시작"}
            </Button>
          ) : (
            <p className="rounded-2xl bg-warning-soft p-4 text-base leading-6 text-muted">
              MFA를 켜려면 먼저 위의 로그인 방법에서 이메일 로그인 비밀번호를
              만들어 주세요. 소셜 로그인만 사용하는 계정이 잠기지 않도록
              비밀번호 설정을 먼저 요구합니다.
            </p>
          )
        ) : null}

        {mode === "setup" && setup ? (
          <div className="grid gap-5 rounded-2xl bg-surface-2 p-4 md:grid-cols-[auto_1fr]">
            <div className="mx-auto rounded-xl bg-white p-3">
              <Image
                src={setup.qrCodeDataUrl}
                alt="MFA 설정용 QR 코드"
                width={240}
                height={240}
                unoptimized
              />
            </div>
            <div className="min-w-0 space-y-4">
              <div>
                <p className="text-base font-semibold text-foreground">
                  인증 앱에 QR 코드를 등록하세요
                </p>
                <p className="mt-1 text-base leading-6 text-muted">
                  Google Authenticator, 1Password 등 TOTP 인증 앱을 사용할 수
                  있습니다.
                </p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted">수동 입력 키</p>
                <code className="mt-1 block break-all rounded-xl bg-card p-3 text-base font-semibold tracking-wider text-foreground">
                  {setup.secret}
                </code>
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="mfa-setup-code"
                  className="text-base font-semibold text-foreground"
                >
                  인증 앱 코드
                </label>
                <Input
                  id="mfa-setup-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6자리 코드"
                  className="h-14 rounded-xl bg-card text-lg tracking-[0.2em]"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  className="min-h-12 rounded-xl text-base"
                  disabled={pending || code.trim().length < 6}
                  onClick={() => void submitCode("confirm")}
                >
                  {pending ? "확인 중…" : "MFA 켜기"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-12 rounded-xl text-base"
                  disabled={pending}
                  onClick={resetFlow}
                >
                  취소
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {mode === "recovery" ? (
          <div className="space-y-4 rounded-2xl bg-warning-soft p-4">
            <div>
              <p className="text-lg font-semibold text-foreground">
                복구 코드를 지금 저장하세요
              </p>
              <p className="mt-1 text-base leading-6 text-muted">
                인증 앱을 사용할 수 없을 때 한 번씩 사용할 수 있습니다. 이
                화면을 닫으면 코드를 다시 볼 수 없습니다.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-card p-4 sm:grid-cols-3">
              {recoveryCodes.map((recoveryCode) => (
                <code
                  key={recoveryCode}
                  className="text-center text-base font-semibold tracking-wider text-foreground"
                >
                  {recoveryCode}
                </code>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="min-h-12 rounded-xl text-base"
                onClick={() => void copyRecoveryCodes()}
              >
                복구 코드 복사
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="min-h-12 rounded-xl text-base"
                onClick={resetFlow}
              >
                저장 완료
              </Button>
            </div>
          </div>
        ) : null}

        {mode === "disable" ? (
          <div className="space-y-4 rounded-2xl bg-warning-soft p-4">
            <div>
              <p className="text-lg font-semibold text-foreground">MFA 끄기</p>
              <p className="mt-1 text-base leading-6 text-muted">
                현재 인증 앱 코드 또는 사용하지 않은 복구 코드가 필요합니다.
              </p>
            </div>
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="text"
              autoComplete="one-time-code"
              placeholder="인증 코드 또는 복구 코드"
              className="h-14 rounded-xl bg-card text-lg"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="destructive"
                className="min-h-12 rounded-xl text-base"
                disabled={pending || !code.trim()}
                onClick={() => void submitCode("disable")}
              >
                {pending ? "처리 중…" : "MFA 끄기"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="min-h-12 rounded-xl text-base"
                disabled={pending}
                onClick={resetFlow}
              >
                취소
              </Button>
            </div>
          </div>
        ) : null}

        {message ? (
          <p className="text-base font-medium text-muted" role="status">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
