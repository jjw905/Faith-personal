"use client";

import { useState } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAppContext } from "@/context/app-context";
import { cn } from "@/lib/utils";

/** 좌: 라벨/설명, 우: 컨트롤 (설정 항목 공통 행). */
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
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description ? (
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** 토글 스위치. */
function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors",
        on ? "bg-primary" : "bg-surface-2",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-card shadow-soft transition-transform",
          on ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/** 세그먼트 선택. */
function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="inline-flex rounded-xl bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
            value === o.value
              ? "bg-card text-foreground shadow-soft"
              : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function AccountPage() {
  const { currentUser } = useAppContext();
  const [emailAlert, setEmailAlert] = useState(true);
  const [pushAlert, setPushAlert] = useState(false);
  const [weeklyReport, setWeeklyReport] = useState(true);
  const [language, setLanguage] = useState("ko");
  const [theme, setTheme] = useState("light");

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader
          title="계정 설정"
          description="프로필, 알림, 언어 등 개인 계정 환경을 관리합니다."
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">프로필</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-primary text-base font-semibold text-primary-foreground">
                {currentUser.avatarInitials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-base font-semibold text-foreground">
                {currentUser.name}
              </p>
              <p className="text-sm text-muted">{currentUser.role}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">알림</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border py-0">
            <SettingRow label="이메일 알림" description="중요 보안 이벤트를 메일로 받습니다.">
              <Toggle on={emailAlert} onChange={setEmailAlert} />
            </SettingRow>
            <SettingRow label="푸시 알림" description="브라우저 푸시로 실시간 알림을 받습니다.">
              <Toggle on={pushAlert} onChange={setPushAlert} />
            </SettingRow>
            <SettingRow label="주간 리포트" description="매주 마스킹, 보안 요약을 받습니다.">
              <Toggle on={weeklyReport} onChange={setWeeklyReport} />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">환경</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border py-0">
            <SettingRow label="언어" description="화면 표시 언어를 선택합니다.">
              <Segmented
                value={language}
                onChange={setLanguage}
                options={[
                  { value: "ko", label: "한국어" },
                  { value: "en", label: "English" },
                ]}
              />
            </SettingRow>
            <SettingRow label="테마" description="밝은/어두운 화면 모드입니다.">
              <Segmented
                value={theme}
                onChange={setTheme}
                options={[
                  { value: "light", label: "라이트" },
                  { value: "dark", label: "다크" },
                ]}
              />
            </SettingRow>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
