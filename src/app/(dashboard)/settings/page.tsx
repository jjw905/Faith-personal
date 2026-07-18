"use client";

import { useState } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
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

/** 회의 운영 관련 시스템 설정. 팀/개인에 따라 노출 항목이 달라집니다. */
export default function SettingsPage() {
  const {
    workspaceId,
    workspace,
    autoOpenTimelineOnStart,
    setAutoOpenTimelineOnStart,
  } = useAppContext();
  const isTeam = workspaceId === "team";
  const [autoMask, setAutoMask] = useState(true);
  const [speakerSplit, setSpeakerSplit] = useState(true);
  const [retention, setRetention] = useState("90");
  const [summaryLang, setSummaryLang] = useState("ko");
  const [enforceMask, setEnforceMask] = useState(true);

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader
          title="시스템 설정"
          description={
            isTeam
              ? `${workspace.title} 워크스페이스, 보존, 마스킹 정책 등 팀 운영 설정을 관리합니다.`
              : `${workspace.title} 워크스페이스, 내 기본 마스킹, 요약 설정만 관리합니다.`
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">기록·마스킹</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border py-0">
            <SettingRow
              label="자동 마스킹"
              description={
                isTeam
                  ? "팀 회의 기록 시 개인정보를 기본으로 마스킹합니다."
                  : "내 회의 기록 시 개인정보를 기본으로 마스킹합니다."
              }
            >
              <Toggle on={autoMask} onChange={setAutoMask} />
            </SettingRow>
            <SettingRow
              label="화자 분리"
              description="녹음에서 화자를 구분해 기록합니다."
            >
              <Toggle on={speakerSplit} onChange={setSpeakerSplit} />
            </SettingRow>
            <SettingRow
              label="회의 시작 시 타임라인 열기"
              description="녹음(인식)을 시작하면 타임라인 패널을 열린 상태로 시작합니다."
            >
              <Toggle
                on={autoOpenTimelineOnStart}
                onChange={setAutoOpenTimelineOnStart}
              />
            </SettingRow>
            <SettingRow
              label="요약 언어"
              description="자동 요약에 사용할 기본 언어입니다."
            >
              <Segmented
                value={summaryLang}
                onChange={setSummaryLang}
                options={[
                  { value: "ko", label: "한국어" },
                  { value: "en", label: "English" },
                ]}
              />
            </SettingRow>
            {isTeam ? (
              <SettingRow
                label="팀 마스킹 정책 강제"
                description="멤버 개인 설정과 달라도 팀 정책을 우선 적용합니다."
              >
                <Toggle on={enforceMask} onChange={setEnforceMask} />
              </SettingRow>
            ) : null}
          </CardContent>
        </Card>

        {isTeam ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">보존·워크스페이스</CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-border py-0">
              <SettingRow
                label="회의록 보존 기간"
                description="기간이 지나면 아카이브 또는 삭제 정책을 적용합니다."
              >
                <Segmented
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
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">개인 공간 안내</CardTitle>
            </CardHeader>
            <CardContent className="py-4">
              <p className="text-sm leading-relaxed text-muted">
                보존 기간, 감사 로그, 사용자 관리는 팀 워크스페이스에서만
                설정·확인할 수 있습니다. 팀으로 전환하면 공유 회의와 관리
                메뉴가 열립니다.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
