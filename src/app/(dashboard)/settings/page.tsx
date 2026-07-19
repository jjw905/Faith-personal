"use client";

import { useState } from "react";

import { PageContainer } from "@/components/layout/page-container";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

/** M3 switch: 52×32 track, 24 thumb */
function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        "inline-flex h-8 w-[52px] shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        on ? "justify-end bg-primary" : "justify-start bg-surface-2",
      )}
    >
      <span className="block h-6 w-6 rounded-full bg-card shadow-[0_1px_2px_rgba(17,24,46,0.18)]" />
    </button>
  );
}

function Segmented({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="inline-flex max-w-full flex-wrap rounded-xl bg-surface p-1"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
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

function SectionLabel({
  variant,
  children,
}: {
  variant: "personal" | "team";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "text-sm font-bold tracking-tight",
        variant === "personal" ? "text-foreground" : "text-primary",
      )}
    >
      {children}
    </p>
  );
}

export default function SettingsPage() {
  const { autoOpenTimelineOnStart, setAutoOpenTimelineOnStart } =
    useAppContext();

  const [personalAutoMask, setPersonalAutoMask] = useState(true);
  const [speakerSplit, setSpeakerSplit] = useState(true);
  const [summaryLang, setSummaryLang] = useState("ko");

  const [teamAutoMask, setTeamAutoMask] = useState(true);
  const [enforceMask, setEnforceMask] = useState(true);
  const [retention, setRetention] = useState("90");

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold leading-none tracking-tight text-foreground">
            시스템 설정
          </h1>
        </header>

        <Card>
          <CardHeader className="space-y-2 px-5 pb-2 pt-5 sm:px-6">
            <SectionLabel variant="personal">개인</SectionLabel>
            <CardTitle className="text-lg">내 기록 기본값</CardTitle>
            <p className="text-sm leading-relaxed text-muted">
              개인 워크스페이스 회의에만 적용됩니다.
            </p>
          </CardHeader>
          <CardContent className="divide-y divide-border px-5 pb-4 pt-0 sm:px-6">
            <SettingRow
              label="자동 마스킹"
              description="내 회의 기록 시 개인정보를 기본으로 마스킹합니다."
            >
              <Toggle
                label="개인 자동 마스킹"
                on={personalAutoMask}
                onChange={setPersonalAutoMask}
              />
            </SettingRow>
            <SettingRow
              label="화자 분리"
              description="녹음에서 화자를 구분해 기록합니다."
            >
              <Toggle
                label="화자 분리"
                on={speakerSplit}
                onChange={setSpeakerSplit}
              />
            </SettingRow>
            <SettingRow
              label="회의 시작 시 타임라인 열기"
              description="녹음(인식)을 시작하면 타임라인 패널을 열린 상태로 시작합니다."
            >
              <Toggle
                label="회의 시작 시 타임라인 열기"
                on={autoOpenTimelineOnStart}
                onChange={setAutoOpenTimelineOnStart}
              />
            </SettingRow>
            <SettingRow
              label="요약 언어"
              description="자동 요약에 사용할 기본 언어입니다."
            >
              <Segmented
                ariaLabel="요약 언어"
                value={summaryLang}
                onChange={setSummaryLang}
                options={[
                  { value: "ko", label: "한국어" },
                  { value: "en", label: "English" },
                ]}
              />
            </SettingRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2 px-5 pb-2 pt-5 sm:px-6">
            <SectionLabel variant="team">팀</SectionLabel>
            <CardTitle className="text-lg">팀 운영 정책</CardTitle>
            <p className="text-sm leading-relaxed text-muted">
              팀 워크스페이스 회의와 멤버에게 적용됩니다.
            </p>
          </CardHeader>
          <CardContent className="divide-y divide-border px-5 pb-4 pt-0 sm:px-6">
            <SettingRow
              label="자동 마스킹"
              description="팀 회의 기록 시 개인정보를 기본으로 마스킹합니다."
            >
              <Toggle
                label="팀 자동 마스킹"
                on={teamAutoMask}
                onChange={setTeamAutoMask}
              />
            </SettingRow>
            <SettingRow
              label="마스킹 정책 강제"
              description="멤버 개인 설정과 달라도 팀 정책을 우선 적용합니다."
            >
              <Toggle
                label="팀 마스킹 정책 강제"
                on={enforceMask}
                onChange={setEnforceMask}
              />
            </SettingRow>
            <SettingRow
              label="회의록 보존 기간"
              description="기간이 지나면 아카이브 또는 삭제 정책을 적용합니다."
            >
              <Segmented
                ariaLabel="회의록 보존 기간"
                value={retention}
                onChange={setRetention}
                options={[
                  { value: "30", label: "30일" },
                  { value: "90", label: "90일" },
                  { value: "365", label: "1년" },
                ]}
              />
            </SettingRow>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
