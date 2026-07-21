"use client";

import { useState } from "react";

import {
  AccountScreen,
  AuditScreen,
  ButtonsScreen,
  ChangelogScreen,
  HelpScreen,
  LiveMeetingScreen,
  LoginScreen,
  MeetingsScreen,
  SettingsScreen,
  SignupScreen,
  TeamScreen,
  UsersScreen,
  VaultScreen,
} from "@/components/design/design-screens";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "account", label: "계정 설정", View: AccountScreen },
  { id: "login", label: "로그인", View: LoginScreen },
  { id: "signup", label: "회원가입", View: SignupScreen },
  { id: "meetings", label: "회의", View: MeetingsScreen },
  { id: "vault", label: "보관함", View: VaultScreen },
  { id: "settings", label: "시스템 설정", View: SettingsScreen },
  { id: "help", label: "도움말", View: HelpScreen },
  { id: "changelog", label: "Changelog", View: ChangelogScreen },
  { id: "team", label: "팀 관리", View: TeamScreen },
  { id: "audit", label: "감사 로그", View: AuditScreen },
  { id: "users", label: "사용자 관리", View: UsersScreen },
  { id: "live", label: "새 회의", View: LiveMeetingScreen },
  { id: "buttons", label: "버튼", View: ButtonsScreen },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

/** 개발전용 디자인 미리보기. */
export function DesignLab() {
  const [section, setSection] = useState<SectionId>("account");
  const active = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const View = active.View;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="mb-8 sm:mb-10">
        <p className="text-xs font-semibold tracking-wide text-muted-2">
          개발전용
        </p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          디자인
        </h1>
      </header>

      <div
        className="mb-6 flex max-w-full flex-wrap gap-1 rounded-3xl bg-surface p-1.5"
        role="tablist"
        aria-label="디자인 화면"
      >
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={cn(
              "rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
              section === s.id
                ? "bg-card text-foreground shadow-soft"
                : "text-muted hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <View />
    </div>
  );
}
