"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ComponentType,
  type ReactNode,
} from "react";
import { Check, ChevronDown, LoaderCircle, Mail } from "lucide-react";

import { GoogleIcon, NaverIcon, XIcon } from "@/components/auth/social-icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { cn } from "@/lib/utils";

type Role = "USER" | "ADMIN";
type Plan = "FREE" | "PRO";
type Filter = "all" | "admin" | "pro" | "paused";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  plan: Plan;
  disabled: boolean;
  signupProvider: string | null;
  image: string | null;
  createdAt: string | Date;
  teamEntitlement: {
    remainingTeamSlots: number;
    seatLimit: number;
  } | null;
  accounts: { provider: string }[];
};

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  naver: "네이버",
  twitter: "X",
  credentials: "이메일",
};

const PROVIDER_ICON: Record<string, ComponentType<{ className?: string }>> = {
  google: GoogleIcon,
  naver: NaverIcon,
  twitter: XIcon,
};

const PROVIDER_CIRCLE: Record<string, string> = {
  google: "bg-white text-[#3c4043] ring-1 ring-[#c7c7cc]",
  naver: "bg-[#03C75A] text-white",
  twitter: "bg-black text-white",
  credentials: "bg-white text-primary ring-1 ring-border-strong",
};

const PLAN_OPTIONS: { value: Plan; label: string }[] = [
  { value: "FREE", label: "FREE" },
  { value: "PRO", label: "PRO" },
];

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "USER", label: "사용자" },
  { value: "ADMIN", label: "관리자" },
];

function initialsOf(name: string | null, email: string | null) {
  const fromName = name?.trim().slice(0, 1);
  if (fromName) return fromName;
  return email?.trim().slice(0, 1)?.toUpperCase() || "?";
}

/** 가입 수단 + 연동 계정. 가입 수단을 앞에 둔다. */
function providerList(u: UserRow): string[] {
  const linked = u.accounts.map((a) => a.provider);
  const signup = u.signupProvider;
  const ordered: string[] = [];
  if (signup) ordered.push(signup);
  for (const p of linked) {
    if (!ordered.includes(p)) ordered.push(p);
  }
  if (ordered.length === 0) ordered.push("credentials");
  return ordered;
}

function ProviderIcons({
  providers,
  signupProvider,
}: {
  providers: string[];
  signupProvider: string | null;
}) {
  return (
    <ul className="flex items-center gap-1.5" aria-label="가입·연동 수단">
      {providers.map((provider) => {
        const Icon = PROVIDER_ICON[provider];
        const label = PROVIDER_LABEL[provider] ?? provider;
        const isSignup =
          signupProvider === provider ||
          (!signupProvider && provider === providers[0]);
        return (
          <li key={provider}>
            <span
              title={isSignup ? `${label}, 가입` : `${label}, 연동`}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full",
                PROVIDER_CIRCLE[provider] ?? "bg-surface-2 text-muted",
                !isSignup && "opacity-65",
              )}
            >
              {Icon ? (
                <Icon className="h-4 w-4" />
              ) : (
                <Mail className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              )}
              <span className="sr-only">{label}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** MD3 exposed menu 느낌의 커스텀 선택. */
function MenuSelect<T extends string>({
  value,
  options,
  onChange,
  disabled,
  "aria-label": ariaLabel,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // click보다 먼저 닫히지 않도록 pointerdown + 메뉴 밖만 처리
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: T) {
    setOpen(false);
    if (next !== value) onChange(next);
  }

  return (
    <div ref={rootRef} className="relative w-[7.25rem]">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-1.5 rounded-xl border px-3 text-left text-sm font-semibold transition-colors",
          "border-border-strong bg-card text-foreground shadow-soft",
          "hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-primary bg-primary-soft/40",
        )}
      >
        <span className="truncate">{current}</span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform",
            open && "rotate-180 text-primary",
          )}
          aria-hidden
        />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-border-strong bg-card py-1 shadow-soft"
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <li key={opt.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    // 바깥 pointerdown보다 먼저 확정 (클릭 유실 방지)
                    e.preventDefault();
                    e.stopPropagation();
                    choose(opt.value);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-semibold",
                    selected
                      ? "bg-primary-soft text-primary"
                      : "text-foreground hover:bg-surface",
                  )}
                >
                  <span>{opt.label}</span>
                  {selected ? (
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function StaticValue({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-10 min-w-[7.25rem] items-center rounded-xl bg-surface px-3 text-sm font-semibold text-muted">
      {children}
    </span>
  );
}

export function UsersAdminPanel({
  initialUsers,
  currentUserId,
}: {
  initialUsers: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const { scenarioId, isLive } = usePageUxPreview();
  const [users, setUsers] = useState(initialUsers);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const isLocalDevelopment = process.env.NODE_ENV === "development";

  const viewUsers = useMemo(() => {
    if (scenarioId === "empty") return [];
    if (scenarioId === "full") {
      if (users.length >= 12) return users;
      const padded = [...users];
      for (let i = padded.length; i < 12; i += 1) {
        padded.push({
          id: `ux-user-${i + 1}`,
          name: `미리보기 사용자 ${i + 1}`,
          email: `preview${i + 1}@example.com`,
          role: i % 5 === 0 ? "ADMIN" : "USER",
          plan: i % 3 === 0 ? "PRO" : "FREE",
          disabled: i % 7 === 0,
          signupProvider: "credentials",
          image: null,
          createdAt: new Date(Date.now() - i * 86400000).toISOString(),
          teamEntitlement: null,
          accounts: [{ provider: "credentials" }],
        });
      }
      return padded;
    }
    return users;
  }, [scenarioId, users]);

  if (scenarioId === "loading") {
    return (
      <div className="grid min-h-56 place-items-center rounded-2xl bg-card shadow-soft">
        <LoaderCircle
          className="h-6 w-6 animate-spin text-muted"
          aria-label="불러오는 중"
        />
      </div>
    );
  }

  const stats = useMemo(() => {
    return {
      total: viewUsers.length,
      admins: viewUsers.filter((u) => u.role === "ADMIN").length,
      pro: viewUsers.filter((u) => u.role !== "ADMIN" && u.plan === "PRO")
        .length,
      paused: viewUsers.filter((u) => u.disabled).length,
    };
  }, [viewUsers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return viewUsers.filter((u) => {
      if (filter === "admin" && u.role !== "ADMIN") return false;
      if (filter === "pro" && (u.role === "ADMIN" || u.plan !== "PRO")) {
        return false;
      }
      if (filter === "paused" && !u.disabled) return false;
      if (!q) return true;
      return (
        (u.name ?? "").toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [viewUsers, query, filter]);

  async function patchUser(
    userId: string,
    body: {
      role?: Role;
      plan?: Plan;
      disabled?: boolean;
      teamSlots?: number;
      teamSeatLimit?: number;
    },
  ) {
    setError("");
    const prevSnapshot = users.find((u) => u.id === userId);
    // 낙관적 반영 후 실패 시 롤백
    if (prevSnapshot) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, ...body } : u)),
      );
    }
    if (!isLive || userId.startsWith("ux-user-")) {
      return;
    }
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...body }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        message?: string;
        user?: Partial<UserRow> & { id: string };
      };
      if (!data.ok || !data.user) {
        if (prevSnapshot) {
          setUsers((prev) =>
            prev.map((u) => (u.id === userId ? prevSnapshot : u)),
          );
        }
        setError(data.message ?? "변경에 실패했습니다.");
        return;
      }
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? {
                ...u,
                role: data.user!.role ?? u.role,
                plan: data.user!.plan ?? u.plan,
                disabled: data.user!.disabled ?? u.disabled,
                teamEntitlement:
                  data.user!.teamEntitlement !== undefined
                    ? data.user!.teamEntitlement
                    : u.teamEntitlement,
              }
            : u,
        ),
      );
      // 목록 캐시만 갱신. 로컬 state를 덮어쓰지 않음.
      startTransition(() => router.refresh());
    } catch {
      if (prevSnapshot) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? prevSnapshot : u)),
        );
      }
      setError("변경에 실패했습니다.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatChip
          label="전체"
          value={stats.total}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <StatChip
          label="관리자"
          value={stats.admins}
          active={filter === "admin"}
          onClick={() => setFilter("admin")}
        />
        <StatChip
          label="PRO"
          value={stats.pro}
          active={filter === "pro"}
          onClick={() => setFilter("pro")}
        />
        <StatChip
          label="중지"
          value={stats.paused}
          muted={stats.paused === 0}
          active={filter === "paused"}
          onClick={() => setFilter("paused")}
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름, 이메일"
          className="ml-auto h-10 w-full max-w-[240px] rounded-full bg-surface-2 px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-2 focus:bg-[#dcdee4]"
        />
      </div>

      {query.trim() || filter !== "all" ? (
        <p className="px-1 text-xs font-medium text-muted-2">
          {filtered.length}명 표시 중
        </p>
      ) : null}

      {error ? (
        <p className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="rounded-3xl bg-card shadow-soft">
        <div className="hidden grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_8rem] gap-3 rounded-t-3xl bg-card px-5 py-3 text-xs font-semibold text-muted md:grid">
          <p>사용자</p>
          <p>등급</p>
          <p>역할</p>
          <p>상태</p>
        </div>

        <ul>
          {filtered.map((u) => {
            const isSelf = u.id === currentUserId;
            const providers = providerList(u);
            const joined = new Date(u.createdAt).toLocaleDateString("ko-KR");

            return (
              <li
                key={u.id}
                className="border-t border-border/60 px-5 py-4 first:border-t-0"
              >
                <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_8rem] md:items-center md:gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar className="mt-0.5 h-10 w-10 shrink-0">
                      {u.image ? <AvatarImage src={u.image} alt="" /> : null}
                      <AvatarFallback className="bg-primary-soft text-sm font-semibold text-primary">
                        {initialsOf(u.name, u.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {u.name || "이름 없음"}
                          {isSelf ? (
                            <span className="ml-1.5 text-xs font-medium text-muted">
                              나
                            </span>
                          ) : null}
                        </p>
                        <ProviderIcons
                          providers={providers}
                          signupProvider={u.signupProvider}
                        />
                      </div>
                      <p className="line-clamp-2 break-all text-sm font-medium leading-snug text-muted">
                        {u.email || "이메일 없음"}
                      </p>
                      <p className="text-xs font-medium text-muted-2">
                        가입 {joined}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 md:contents">
                    <div>
                      {u.role === "ADMIN" ? (
                        <StaticValue>—</StaticValue>
                      ) : isSelf ? (
                        <StaticValue>{u.plan}</StaticValue>
                      ) : (
                        <MenuSelect
                          aria-label={`${u.name || u.email} 등급`}
                          value={u.plan}
                          options={PLAN_OPTIONS}
                          disabled={pending}
                          onChange={(plan) => void patchUser(u.id, { plan })}
                        />
                      )}
                    </div>

                    <div>
                      {isSelf ? (
                        <StaticValue>
                          {u.role === "ADMIN" ? "관리자" : "사용자"}
                        </StaticValue>
                      ) : (
                        <MenuSelect
                          aria-label={`${u.name || u.email} 역할`}
                          value={u.role}
                          options={ROLE_OPTIONS}
                          disabled={pending}
                          onChange={(role) => void patchUser(u.id, { role })}
                        />
                      )}
                    </div>

                    <div className="flex h-10 items-center gap-2">
                      <span className="inline-flex h-10 items-center text-xs font-semibold text-muted">
                        {u.disabled ? "중지됨" : "사용 중"}
                      </span>
                      {isSelf ? null : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            void patchUser(u.id, { disabled: !u.disabled })
                          }
                          className={cn(
                            "h-10 rounded-xl border px-3 text-xs font-semibold disabled:opacity-50",
                            u.disabled
                              ? "border-transparent bg-primary text-primary-foreground"
                              : "border-[#f0c4cb] bg-[#fde8ec] text-[#b54a5a] shadow-soft hover:bg-[#f9d5dc]",
                          )}
                        >
                          {u.disabled ? "다시 사용" : "중지"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {isSelf && isLocalDevelopment && u.plan !== "PRO" ? (
                  <div className="mt-3 rounded-2xl bg-surface px-3 py-3">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        void patchUser(u.id, {
                          plan: "PRO",
                          teamSlots: 1,
                          teamSeatLimit: 5,
                        })
                      }
                      className="min-h-12 rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      로컬 팀 테스트 활성화
                    </button>
                  </div>
                ) : null}
                {(!isSelf || isLocalDevelopment) && u.plan === "PRO" ? (
                  <div className="mt-3 flex flex-wrap items-end gap-3 rounded-2xl bg-surface px-3 py-3">
                    <label className="text-sm font-medium text-muted">
                      팀 생성 슬롯
                      <input
                        type="number"
                        min={0}
                        max={20}
                        defaultValue={
                          u.teamEntitlement?.remainingTeamSlots ?? 0
                        }
                        onBlur={(event) =>
                          void patchUser(u.id, {
                            teamSlots: Number(event.target.value),
                            teamSeatLimit: u.teamEntitlement?.seatLimit || 2,
                          })
                        }
                        className="mt-1 block h-10 w-24 rounded-xl border border-border bg-card px-3 text-base text-foreground"
                      />
                    </label>
                    <label className="text-sm font-medium text-muted">
                      팀 좌석
                      <input
                        type="number"
                        min={2}
                        max={500}
                        defaultValue={u.teamEntitlement?.seatLimit || 2}
                        onBlur={(event) =>
                          void patchUser(u.id, {
                            teamSlots:
                              u.teamEntitlement?.remainingTeamSlots ?? 0,
                            teamSeatLimit: Number(event.target.value),
                          })
                        }
                        className="mt-1 block h-10 w-24 rounded-xl border border-border bg-card px-3 text-base text-foreground"
                      />
                    </label>
                  </div>
                ) : null}
              </li>
            );
          })}
          {filtered.length === 0 ? (
            <li className="border-t border-border/60 px-5 py-12 text-center text-sm font-medium text-muted">
              {query.trim() || filter !== "all"
                ? "조건에 맞는 사용자가 없습니다."
                : "등록된 사용자가 없습니다."}
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  muted,
  active,
  onClick,
}: {
  label: string;
  value: number;
  muted?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-surface text-foreground hover:bg-surface-2",
        muted && !active && "text-muted",
      )}
    >
      <span
        className={cn(
          "font-medium",
          active ? "text-primary-foreground/85" : "text-muted",
        )}
      >
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </button>
  );
}
