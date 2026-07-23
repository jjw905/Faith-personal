"use client";

import { useEffect, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  parseDataRetentionDays,
  readDataRetentionDaysFromStorage,
  writeDataRetentionDaysToStorage,
  type DataRetentionDays,
} from "@/lib/data-retention";
import { WORKSPACE_PEOPLE } from "@/lib/workspace-data";
import { cn } from "@/lib/utils";

const TEAM_MEMBERS = WORKSPACE_PEOPLE.filter((p) => p.name !== "나").map(
  (person, index) => ({
    ...person,
    role: index === 0 ? "팀 관리자" : "멤버",
  }),
);

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
        "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
            "cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors outline-none",
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

/** 팀 멤버와 팀 운영 설정. */
export function TeamManagePanel() {
  const [teamAutoMask, setTeamAutoMask] = useState(true);
  const [enforceMask, setEnforceMask] = useState(true);
  const [retention, setRetention] = useState<DataRetentionDays>(90);

  useEffect(() => {
    setRetention(readDataRetentionDaysFromStorage());
  }, []);

  function updateRetention(next: string) {
    const days = parseDataRetentionDays(next);
    setRetention(days);
    writeDataRetentionDaysToStorage(days);
    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ retentionDays: days }),
    }).catch(() => {
      // ignore
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-1 px-5 pb-2 pt-5 sm:px-6">
          <CardTitle className="text-lg">팀 멤버</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            이 팀에 속한 사람들입니다.
          </p>
        </CardHeader>
        <CardContent className="divide-y divide-border px-5 pb-2 pt-0 sm:px-6">
          {TEAM_MEMBERS.map((member) => (
            <div
              key={member.name}
              className="flex items-center gap-3 py-3.5 first:pt-1 last:pb-1"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback
                  className={cn(
                    "text-xs font-semibold text-white",
                    member.color,
                  )}
                >
                  {member.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {member.name}
                </p>
                <p className="text-xs text-muted">{member.role}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1 px-5 pb-2 pt-5 sm:px-6">
          <CardTitle className="text-lg">팀 설정</CardTitle>
          <p className="text-sm leading-relaxed text-muted">
            팀 회의와 멤버에게 적용되는 운영 정책입니다.
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
            label="데이터 보존 기간"
            description="회의록·알림 등 보관 데이터에 적용합니다. 확인한 알림은 최근 내역에 7일만 보이고, 실제 삭제는 이 기간을 따릅니다."
          >
            <Segmented
              ariaLabel="데이터 보존 기간"
              value={String(retention)}
              onChange={updateRetention}
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
  );
}
