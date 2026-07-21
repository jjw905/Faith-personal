"use client";

import { useState, type ComponentType, type ReactNode } from "react";

import {
  GoogleIcon,
  NaverIcon,
  XIcon,
} from "@/components/auth/social-icons";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Panel = "name" | "email" | "password" | null;

function Frame({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-3xl border border-border-strong bg-background shadow-soft",
        className,
      )}
    >
      <div className="border-b border-border bg-card px-4 py-2.5">
        <p className="text-xs font-semibold tracking-wide text-muted">{title}</p>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </div>
  );
}

function PillBtn({
  children,
  filled,
}: {
  children: ReactNode;
  filled?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold",
        filled
          ? "bg-primary text-primary-foreground"
          : "border border-border-strong bg-surface text-foreground",
      )}
    >
      {children}
    </span>
  );
}

const SOCIAL = [
  {
    id: "google",
    label: "Google",
    status: "가입할 때 사용한 계정",
    linked: true,
    locked: true,
    Icon: GoogleIcon,
    circle: "bg-white text-[#3c4043] ring-1 ring-[#c7c7cc]",
  },
  {
    id: "naver",
    label: "네이버",
    status: "연결됨",
    linked: true,
    locked: false,
    Icon: NaverIcon,
    circle: "bg-[#03C75A] text-white",
  },
  {
    id: "twitter",
    label: "X",
    status: "연결되지 않음",
    linked: false,
    locked: false,
    Icon: XIcon,
    circle: "bg-black text-white",
  },
] as const;

/** 계정 설정 */
export function AccountScreen() {
  const [panel, setPanel] = useState<Panel>(null);
  function toggle(next: Panel) {
    setPanel((p) => (p === next ? null : next));
  }

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
        <Card className="flex h-full flex-col rounded-3xl shadow-soft">
          <CardHeader className="flex flex-row items-center gap-4 space-y-0 px-6 pb-6 pt-6">
            <Avatar className="h-16 w-16 shrink-0">
              <AvatarFallback className="bg-primary-soft text-lg font-semibold text-primary">
                F
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-muted">기본 정보</p>
              <CardTitle className="mt-1 text-lg font-semibold tracking-tight">
                Faith User
              </CardTitle>
              <p className="mt-1 truncate text-sm font-medium text-muted">
                user@example.com
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-6 pb-6">
            <div className="space-y-1 rounded-2xl bg-surface p-4">
              <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2">
                <p className="w-20 shrink-0 text-sm font-semibold">이름</p>
                {panel === "name" ? (
                  <>
                    <Input
                      defaultValue="Faith User"
                      className="h-10 min-w-0 flex-1 rounded-xl bg-card"
                    />
                    <PillBtn filled>저장</PillBtn>
                    <button
                      type="button"
                      onClick={() => setPanel(null)}
                      className="h-10 rounded-full border border-border-strong bg-card px-3.5 text-sm font-semibold"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <p className="min-w-0 flex-1 text-sm font-medium text-foreground/85">
                      Faith User
                    </p>
                    <button
                      type="button"
                      onClick={() => toggle("name")}
                      className="h-10 rounded-full border border-border-strong bg-card px-3.5 text-sm font-semibold"
                    >
                      변경
                    </button>
                  </>
                )}
              </div>
              <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2">
                <p className="w-20 shrink-0 text-sm font-semibold">이메일</p>
                {panel === "email" ? (
                  <>
                    <Input
                      placeholder="새 이메일"
                      className="h-10 min-w-0 flex-1 rounded-xl bg-card"
                    />
                    <PillBtn filled>인증</PillBtn>
                    <button
                      type="button"
                      onClick={() => setPanel(null)}
                      className="h-10 rounded-full border border-border-strong bg-card px-3.5 text-sm font-semibold"
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <>
                    <p className="min-w-0 flex-1 text-sm font-medium text-foreground/85">
                      user@example.com
                    </p>
                    <button
                      type="button"
                      onClick={() => toggle("email")}
                      className="h-10 rounded-full border border-border-strong bg-card px-3.5 text-sm font-semibold"
                    >
                      변경
                    </button>
                  </>
                )}
              </div>
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
              <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2">
                <p className="w-20 shrink-0 text-sm font-semibold">비밀번호</p>
                <p className="min-w-0 flex-1 text-sm font-medium text-foreground/85">
                  사용 중
                </p>
                <button
                  type="button"
                  onClick={() => toggle("password")}
                  className="h-10 rounded-full border border-border-strong bg-card px-3.5 text-sm font-semibold"
                >
                  변경
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <p className="text-sm font-semibold">연결된 계정</p>
              <div className="overflow-hidden rounded-2xl bg-surface px-2 py-1">
                {SOCIAL.map((item) => {
                  const Icon = item.Icon as ComponentType<{
                    className?: string;
                  }>;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 px-2.5 py-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-full",
                            item.circle,
                            !item.linked && "opacity-70",
                          )}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">{item.label}</p>
                          <p className="text-sm font-medium text-muted">
                            {item.status}
                          </p>
                        </div>
                      </div>
                      {item.locked ? null : (
                        <span
                          className={cn(
                            "inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-semibold",
                            item.linked
                              ? "border-border-strong bg-card"
                              : "border-transparent bg-primary text-primary-foreground",
                          )}
                        >
                          {item.linked ? "연결 해제" : "연결"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** 로그인 */
export function LoginScreen() {
  return (
    <Frame title="/login">
      <div className="mx-auto w-full max-w-md">
        <h2 className="text-center text-[26px] font-bold tracking-tight">
          로그인
        </h2>
        <div className="mt-4 space-y-3 rounded-3xl bg-card px-7 py-7 shadow-soft ring-1 ring-border-strong">
          {[
            { label: "네이버", className: "bg-[#03C75A] text-white" },
            {
              label: "Google",
              className: "border border-border-strong bg-white text-foreground",
            },
            { label: "X", className: "bg-black text-white" },
          ].map((b) => (
            <div
              key={b.label}
              className={cn(
                "flex h-12 items-center justify-center rounded-xl text-[15px] font-semibold",
                b.className,
              )}
            >
              {b.label}
            </div>
          ))}
          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-border-strong" />
            <span className="text-xs font-medium text-muted">또는</span>
            <span className="h-px flex-1 bg-border-strong" />
          </div>
          <Input placeholder="이메일" className="h-11 rounded-xl" />
          <Input
            type="password"
            placeholder="비밀번호"
            className="h-11 rounded-xl"
          />
          <div className="flex h-12 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
            로그인
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** 회원가입 */
export function SignupScreen() {
  return (
    <Frame title="/signup">
      <div className="mx-auto w-full max-w-md">
        <h2 className="text-center text-[26px] font-bold tracking-tight">
          회원가입
        </h2>
        <div className="mt-4 space-y-3 rounded-3xl bg-card px-7 py-7 shadow-soft ring-1 ring-border-strong">
          <p className="text-[13px] font-semibold">간편 소셜 회원가입</p>
          <div className="flex h-12 items-center justify-center rounded-xl bg-[#03C75A] text-[15px] font-semibold text-white">
            네이버
          </div>
          <div className="flex h-12 items-center justify-center rounded-xl border border-border-strong bg-white text-[15px] font-semibold">
            Google
          </div>
          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-border-strong" />
            <span className="text-xs font-medium text-muted">또는</span>
            <span className="h-px flex-1 bg-border-strong" />
          </div>
          <Input placeholder="이름" className="h-11 rounded-xl" />
          <Input placeholder="이메일" className="h-11 rounded-xl" />
          <Input
            type="password"
            placeholder="비밀번호"
            className="h-11 rounded-xl"
          />
          <div className="flex h-12 items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
            가입하기
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** 회의 */
export function MeetingsScreen() {
  const rows = [
    { title: "주간 제품 리뷰", time: "오늘 14:00", meta: "45분" },
    { title: "고객사 킥오프", time: "어제 10:30", meta: "1시간 12분" },
    { title: "보안 점검 회의", time: "7월 18일", meta: "28분" },
  ];
  return (
    <Frame title="/dashboard">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted">7월 21일 화요일</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight">회의</h2>
          </div>
          <PillBtn filled>+ 새 회의</PillBtn>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex h-24 items-center rounded-2xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-soft">
            녹음으로 시작
          </div>
          <div className="flex h-24 items-center rounded-2xl border border-border bg-card px-6 text-sm font-semibold shadow-soft">
            파일 업로드
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          {rows.map((r, i) => (
            <div
              key={r.title}
              className={cn(
                "flex items-center justify-between gap-3 px-4 py-3.5",
                i > 0 && "border-t border-border",
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{r.title}</p>
                <p className="mt-0.5 text-sm font-medium text-muted">{r.time}</p>
              </div>
              <p className="shrink-0 text-sm font-medium text-muted">{r.meta}</p>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/** 보관함 */
export function VaultScreen() {
  return (
    <Frame title="/vault">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">보관함</h2>
            <p className="mt-1 text-sm font-medium text-muted">
              128MB / 500MB 사용 중
            </p>
          </div>
          <PillBtn filled>업로드</PillBtn>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full w-[26%] rounded-full bg-primary" />
        </div>
        <div className="rounded-2xl border border-dashed border-border-strong bg-surface px-4 py-10 text-center text-sm font-medium text-muted">
          파일을 끌어다 놓거나 업로드하세요
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {["킥오프-녹음.m4a", "계약서-초안.pdf", "마스킹-샘플.txt"].map(
            (name, i) => (
              <div
                key={name}
                className={cn(
                  "flex items-center justify-between gap-3 px-4 py-3.5",
                  i > 0 && "border-t border-border",
                )}
              >
                <p className="truncate text-sm font-semibold">{name}</p>
                <span className="text-sm font-medium text-muted">2.4MB</span>
              </div>
            ),
          )}
        </div>
      </div>
    </Frame>
  );
}

/** 시스템 설정 */
export function SettingsScreen() {
  const [lang, setLang] = useState("ko");
  return (
    <Frame title="/settings">
      <div className="mx-auto max-w-3xl space-y-5">
        <h2 className="text-2xl font-bold tracking-tight">시스템 설정</h2>
        <Card className="rounded-3xl shadow-soft">
          <CardHeader className="px-5 pb-0 pt-5">
            <CardTitle className="text-base">일반</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border px-5 pb-2">
            <div className="flex items-center justify-between gap-4 py-3.5">
              <div>
                <p className="text-sm font-medium">회의 시작 시 타임라인</p>
                <p className="mt-1 text-xs text-muted">자동으로 열어 둡니다</p>
              </div>
              <span className="inline-flex h-8 w-[52px] items-center justify-end rounded-full bg-primary p-1">
                <span className="block h-6 w-6 rounded-full bg-card" />
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 py-3.5">
              <p className="text-sm font-medium">언어</p>
              <div className="inline-flex rounded-xl bg-surface p-1">
                {[
                  { v: "ko", l: "한국어" },
                  { v: "en", l: "English" },
                ].map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setLang(o.v)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold",
                      lang === o.v
                        ? "bg-card text-foreground shadow-soft"
                        : "text-muted",
                    )}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Frame>
  );
}

/** 도움말 */
export function HelpScreen() {
  return (
    <Frame title="/help">
      <div className="space-y-4">
        <h2 className="text-2xl font-bold tracking-tight">도움말</h2>
        <div className="flex h-11 items-center rounded-xl border border-border bg-card px-3 text-sm text-muted">
          문서 검색...
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {["시작하기", "보안과 마스킹", "회의 녹음", "계정과 로그인"].map(
            (t) => (
              <div
                key={t}
                className="rounded-2xl border border-border bg-card px-4 py-4 shadow-soft"
              >
                <p className="text-sm font-semibold">{t}</p>
                <p className="mt-1 text-sm font-medium text-muted">
                  관련 안내 보기
                </p>
              </div>
            ),
          )}
        </div>
      </div>
    </Frame>
  );
}

/** Changelog */
export function ChangelogScreen() {
  return (
    <Frame title="/changelog">
      <div className="mx-auto max-w-3xl space-y-6">
        <h2 className="text-2xl font-bold tracking-tight">Changelog</h2>
        {[
          {
            date: "2026년 7월 21일",
            title: "계정 연동과 설정 화면",
            items: ["소셜 연결 정리", "계정 설정 레이아웃"],
          },
          {
            date: "2026년 7월 18일",
            title: "로그인과 보관함",
            items: ["소셜 로그인", "파일 보관함"],
          },
        ].map((g) => (
          <section key={g.date} className="border-b border-border pb-6">
            <p className="text-xs font-semibold tabular-nums text-muted">
              {g.date}
            </p>
            <h3 className="mt-2 text-lg font-semibold">{g.title}</h3>
            <ul className="mt-3 space-y-1.5 text-sm font-medium text-muted">
              {g.items.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Frame>
  );
}

/** 팀 관리 */
export function TeamScreen() {
  return (
    <Frame title="/team">
      <div className="space-y-5">
        <h2 className="text-2xl font-bold tracking-tight">팀 관리</h2>
        <Card className="rounded-3xl shadow-soft">
          <CardContent className="divide-y divide-border px-5 py-1">
            {[
              { name: "김서연", role: "팀 관리자" },
              { name: "이준호", role: "멤버" },
              { name: "박민지", role: "멤버" },
            ].map((m) => (
              <div
                key={m.name}
                className="flex items-center justify-between gap-3 py-3.5"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary">
                      {m.name.slice(0, 1)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-semibold">{m.name}</p>
                    <p className="text-sm font-medium text-muted">{m.role}</p>
                  </div>
                </div>
                <PillBtn>관리</PillBtn>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </Frame>
  );
}

/** 감사 로그 */
export function AuditScreen() {
  return (
    <Frame title="/audit">
      <div className="space-y-5">
        <h2 className="text-2xl font-bold tracking-tight">감사 로그</h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          {[
            { ev: "로그인 성공", who: "user@example.com", when: "14:02" },
            { ev: "파일 업로드", who: "보관함", when: "13:40" },
            { ev: "마스킹 실행", who: "회의 #128", when: "11:18" },
          ].map((r, i) => (
            <div
              key={r.ev + r.when}
              className={cn(
                "grid grid-cols-[1fr_auto] gap-3 px-4 py-3.5 sm:grid-cols-[1.2fr_1fr_auto]",
                i > 0 && "border-t border-border",
              )}
            >
              <p className="text-sm font-semibold">{r.ev}</p>
              <p className="hidden text-sm font-medium text-muted sm:block">
                {r.who}
              </p>
              <p className="text-sm font-medium tabular-nums text-muted">
                {r.when}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/** 사용자 관리 */
export function UsersScreen() {
  const rows = [
    {
      name: "관리자",
      email: "admin@faith.app",
      initials: "관",
      role: "ADMIN",
      plan: "ADMIN",
      providers: ["credentials"] as const,
      when: "2026. 3. 1.",
      status: "사용 중",
    },
    {
      name: "프로 유저",
      email: "pro@example.com",
      initials: "프",
      role: "USER",
      plan: "PRO",
      providers: ["google", "naver"] as const,
      when: "2026. 5. 12.",
      status: "사용 중",
    },
    {
      name: "신규",
      email: "free@example.com",
      initials: "신",
      role: "USER",
      plan: "FREE",
      providers: ["twitter"] as const,
      when: "2026. 7. 18.",
      status: "사용 중",
    },
  ];

  return (
    <Frame title="/users">
      <div className="space-y-5">
        <h2 className="text-2xl font-bold tracking-tight">사용자 관리</h2>
        <div className="flex flex-wrap gap-2">
          {[
            { k: "전체", v: "24" },
            { k: "관리자", v: "2" },
            { k: "PRO", v: "6" },
          ].map((s) => (
            <span
              key={s.k}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm"
            >
              <span className="font-medium text-muted">{s.k}</span>
              <span className="font-semibold tabular-nums">{s.v}</span>
            </span>
          ))}
        </div>
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
          {rows.map((u) => (
            <div
              key={u.email}
              className="flex flex-wrap items-center gap-4 border-t border-border px-5 py-4 first:border-t-0"
            >
              <div className="flex min-w-[12rem] flex-1 items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                  {u.initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{u.name}</p>
                  <p className="truncate text-sm font-medium text-muted">
                    {u.email}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex gap-1.5">
                  {u.providers.map((p) => (
                    <span
                      key={p}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-full",
                        p === "google" &&
                          "bg-white ring-1 ring-[#c7c7cc] text-[#3c4043]",
                        p === "naver" && "bg-[#03C75A] text-white",
                        p === "twitter" && "bg-black text-white",
                        p === "credentials" && "bg-primary-soft text-primary",
                      )}
                    >
                      {p === "google" ? (
                        <GoogleIcon className="h-4 w-4" />
                      ) : p === "naver" ? (
                        <NaverIcon className="h-4 w-4" />
                      ) : p === "twitter" ? (
                        <XIcon className="h-4 w-4" />
                      ) : (
                        <span className="text-[10px] font-bold">메일</span>
                      )}
                    </span>
                  ))}
                </div>
                <p className="text-xs font-medium text-muted">{u.when}</p>
              </div>
              <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary">
                {u.plan}
              </span>
              <span className="text-xs font-semibold">{u.role}</span>
              <span className="ml-auto h-9 rounded-full border border-border-strong bg-surface px-3 text-xs font-semibold leading-9">
                {u.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/** 새 회의 / 실시간 */
export function LiveMeetingScreen() {
  return (
    <Frame title="/meetings/new">
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="text-sm font-semibold">실시간 인식</p>
          <div className="mt-3 space-y-2">
            {[
              "오늘 회의 안건을 정리합니다.",
              "연락처는 010-1234-5678 입니다.",
              "계좌는 국민 123-456 입니다.",
            ].map((t) => (
              <p
                key={t}
                className="rounded-xl bg-surface px-3 py-2 text-sm font-medium leading-relaxed"
              >
                {t}
              </p>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <p className="text-sm font-semibold">마스킹 결과</p>
          <div className="mt-3 space-y-2">
            {[
              "오늘 회의 안건을 정리합니다.",
              "연락처는 [전화번호] 입니다.",
              "계좌는 [계좌번호] 입니다.",
            ].map((t) => (
              <p
                key={t}
                className="rounded-xl bg-surface px-3 py-2 text-sm font-medium leading-relaxed"
              >
                {t}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}

/** 버튼 */
export function ButtonsScreen() {
  return (
    <Frame title="components / buttons">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="h-10 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground"
        >
          Primary
        </button>
        <button
          type="button"
          className="h-9 rounded-full border border-border-strong bg-surface px-3.5 text-sm font-semibold"
        >
          Text
        </button>
        <button
          type="button"
          className="h-9 rounded-xl bg-surface-2 px-3 text-sm font-medium"
        >
          Tonal
        </button>
        <button
          type="button"
          disabled
          className="h-9 rounded-full px-3.5 text-sm font-semibold text-muted disabled:cursor-not-allowed"
        >
          Disabled
        </button>
      </div>
    </Frame>
  );
}
