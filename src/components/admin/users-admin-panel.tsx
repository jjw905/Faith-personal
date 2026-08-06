"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type ComponentType,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  IdCard,
  Mail,
  MoreVertical,
  Search,
  UserRound,
  Users,
  UsersRound,
  X,
} from "lucide-react";

import {
  UserAdminChangeDialog,
  type AdminChangeDraft,
} from "@/components/admin/user-admin-change-dialog";
import { AuditRangeCalendar } from "@/components/admin/audit-range-calendar";
import {
  UsersAdminMobileRail,
  type UsersAdminMobilePane,
} from "@/components/admin/users-admin-mobile-rail";
import { GoogleIcon, NaverIcon, XIcon } from "@/components/auth/social-icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LoadingMark } from "@/components/ui/loading-mark";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  fixtureAdminTeamsEmpty,
  fixtureAdminTeamsFull,
} from "@/lib/page-ux-fixtures";
import { cn } from "@/lib/utils";

function useIsNarrowMobile() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(max-width: 767px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

type Filter = "all" | "admin" | "pro" | "paused" | "noteam";

type Role = "USER" | "ADMIN";
type Plan = "FREE" | "PRO";
/** 가입일 정렬 */
type Sort = "desc" | "asc";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  handle: string | null;
  role: Role;
  plan: Plan;
  disabled: boolean;
  planUntil?: string | Date | null;
  disabledUntil?: string | Date | null;
  signupProvider: string | null;
  image: string | null;
  createdAt: string | Date;
  teamEntitlement: {
    remainingTeamSlots: number;
    seatLimit: number;
  } | null;
  accounts: { provider: string }[];
  teamMemberships: {
    role: string;
    team: { name: string; slug: string };
  }[];
  _count: { teamMemberships: number };
};

type UserStats = {
  total: number;
  admins: number;
  pro: number;
  paused: number;
  noteam: number;
};

/** 관리자 팀 목록. 운영 메타만 (회의·공지·정책 본문 제외). */
type TeamOpsContact = {
  id: string;
  role: "OWNER" | "ADMIN";
  name: string | null;
  handle: string | null;
  email: string | null;
  disabled: boolean;
};

type TeamOpsInvite = {
  email: string | null;
  name: string | null;
  handle: string | null;
};

type TeamRow = {
  id: string;
  name: string;
  slug: string;
  plan: "TEAM";
  seatLimit: number;
  memberCount: number;
  adminCount: number;
  pendingInviteCount: number;
  meetingCount: number;
  lastMeetingAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string | null;
    handle: string | null;
    email: string | null;
    disabled: boolean;
  };
  managers: TeamOpsContact[];
  pendingInvites: TeamOpsInvite[];
};

type AdminAuditPerson = {
  id: string;
  name: string | null;
  email: string | null;
  handle: string | null;
};

type AdminAuditRow = {
  id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actor: AdminAuditPerson | null;
  targetUser: AdminAuditPerson | null;
};

const ADMIN_AUDIT_ACTION_LABEL: Record<string, string> = {
  "user.plan": "등급",
  "user.role": "역할",
  "user.disabled": "상태",
  "user.team_entitlement": "팀권한",
};

const AUDIT_PERIOD_OPTIONS = [
  { id: "day" as const, label: "오늘" },
  { id: "week" as const, label: "7일" },
  { id: "month" as const, label: "30일" },
  { id: "year" as const, label: "올해" },
  { id: "all" as const, label: "전체" },
];

const AUDIT_ACTION_OPTIONS = [
  { id: "all" as const, label: "전체" },
  { id: "user.plan" as const, label: "등급" },
  { id: "user.role" as const, label: "역할" },
  { id: "user.disabled" as const, label: "상태" },
  { id: "user.team_entitlement" as const, label: "팀권한" },
];

type AuditPeriod = (typeof AUDIT_PERIOD_OPTIONS)[number]["id"];
type AuditActionFilter = (typeof AUDIT_ACTION_OPTIONS)[number]["id"];

function personLabel(person: AdminAuditPerson | null): string {
  if (!person) return "알 수 없음";
  return person.name || person.handle || person.email || "사용자";
}

function formatAuditWhen(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function seoulTodayYmd() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addSeoulDays(ymd: string, delta: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, d + delta);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(utc));
}

function periodRangeYmd(period: AuditPeriod): { from: string; to: string } | null {
  const to = seoulTodayYmd();
  if (period === "all") return null;
  if (period === "day") return { from: to, to };
  if (period === "week") return { from: addSeoulDays(to, -6), to };
  if (period === "month") return { from: addSeoulDays(to, -29), to };
  const [y] = to.split("-");
  return { from: `${y}-01-01`, to };
}

function auditChangeParts(
  action: string,
  metadata: Record<string, unknown> | null,
): { before: string; after: string; penalty: boolean } | null {
  if (!metadata) return null;
  const before = metadata.before;
  const after = metadata.after;
  if (action === "user.team_entitlement") {
    const b = before as
      | { teamSlots?: number | null; teamSeatLimit?: number | null }
      | undefined;
    const a = after as
      | { teamSlots?: number | null; teamSeatLimit?: number | null }
      | undefined;
    const beforeSlots = b?.teamSlots ?? 0;
    const afterSlots = a?.teamSlots ?? 0;
    const beforeSeats = b?.teamSeatLimit ?? 0;
    const afterSeats = a?.teamSeatLimit ?? 0;
    return {
      before: `팀 ${b?.teamSlots ?? "—"} / 정원 ${b?.teamSeatLimit ?? "—"}`,
      after: `팀 ${a?.teamSlots ?? "—"} / 정원 ${a?.teamSeatLimit ?? "—"}`,
      penalty: afterSlots < beforeSlots || afterSeats < beforeSeats,
    };
  }
  if (action === "user.disabled") {
    return {
      before: before ? "정지" : "사용",
      after: after ? "정지" : "사용",
      penalty: Boolean(after),
    };
  }
  if (action === "user.role") {
    const label = (v: unknown) => (v === "ADMIN" ? "관리자" : "사용자");
    return {
      before: label(before),
      after: label(after),
      penalty: before === "ADMIN" && after !== "ADMIN",
    };
  }
  if (action === "user.plan") {
    const rank = (v: unknown) => (v === "PRO" ? 1 : 0);
    return {
      before: String(before ?? "—"),
      after: String(after ?? "—"),
      penalty: rank(after) < rank(before),
    };
  }
  return {
    before: String(before ?? "—"),
    after: String(after ?? "—"),
    penalty: false,
  };
}

function AuditChangeFlow({
  before,
  after,
  penalty,
}: {
  before: string;
  after: string;
  penalty?: boolean;
}) {
  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
      <span className="inline-flex max-w-full truncate rounded-full bg-surface-2 px-3 py-1 text-base font-semibold text-muted">
        {before}
      </span>
      <ArrowRight
        className={cn(
          "h-4 w-4 shrink-0",
          penalty ? "text-red-500" : "text-muted-2",
        )}
        strokeWidth={2}
        aria-hidden
      />
      <span
        className={cn(
          "inline-flex max-w-full truncate rounded-full px-3 py-1 text-base font-semibold",
          penalty
            ? "bg-red-50 text-red-700"
            : "bg-primary-soft text-primary",
        )}
      >
        {after}
      </span>
    </div>
  );
}

/** 모바일: 검색 버튼을 눌러야 자판이 열림. 데스크톱은 항상 표시. */
function AuditSearchField({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (next: string) => void;
  onClear: () => void;
}) {
  const isNarrow = useIsNarrowMobile();
  const [mobileOpen, setMobileOpen] = useState(Boolean(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const showField = !isNarrow || mobileOpen || Boolean(value);

  useEffect(() => {
    if (!isNarrow || !mobileOpen) return;
    inputRef.current?.focus();
  }, [isNarrow, mobileOpen]);

  if (!showField) {
    return (
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-surface-2 text-base font-semibold text-muted"
      >
        <Search className="h-5 w-5" aria-hidden />
        이름으로 검색
      </button>
    );
  }

  return (
    <label className="relative min-w-0 w-full">
      <span className="sr-only">검색</span>
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (isNarrow && !value.trim()) setMobileOpen(false);
        }}
        placeholder="실행자, 대상"
        className="h-14 w-full rounded-full bg-surface-2 py-2 pl-12 pr-11 text-lg text-foreground outline-none placeholder:text-muted-2 focus:bg-[#dcdee4] md:h-12 md:text-base"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onClear();
            if (isNarrow) setMobileOpen(false);
          }}
          className="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface md:h-8 md:w-8"
          aria-label="검색어 지우기"
        >
          <X className="h-5 w-5 md:h-4 md:w-4" aria-hidden />
        </button>
      ) : null}
    </label>
  );
}

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

/** 프로필 구석 등급 칩. FREE / PRO / ADMIN */
const TIER_BADGE: Record<"FREE" | "PRO" | "ADMIN", string> = {
  FREE: "bg-surface-2 text-muted",
  PRO: "bg-[linear-gradient(135deg,#a5f3fc_0%,#e0f2fe_40%,#d1fae5_70%,#a7f3d0_100%)] text-[#065f56]",
  ADMIN: "bg-primary text-primary-foreground",
};

function tierOf(u: Pick<UserRow, "role" | "plan">): "FREE" | "PRO" | "ADMIN" {
  return u.role === "ADMIN" ? "ADMIN" : u.plan;
}

const SORT_OPTIONS: {
  value: Sort;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}[] = [
  { value: "desc", label: "내림차순", icon: ArrowDown },
  { value: "asc", label: "오름차순", icon: ArrowUp },
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
  maxVisible = 4,
  className,
}: {
  providers: string[];
  signupProvider: string | null;
  maxVisible?: number;
  className?: string;
}) {
  const visible = providers.slice(0, maxVisible);
  const overflow = providers.length - visible.length;
  const allLabels = providers
    .map((p) => PROVIDER_LABEL[p] ?? p)
    .join(", ");

  return (
    <ul
      className={cn("flex items-center justify-center gap-1.5", className)}
      aria-label={`가입, 연동: ${allLabels}`}
      title={allLabels}
    >
      {visible.map((provider) => {
        const Icon = PROVIDER_ICON[provider];
        const label = PROVIDER_LABEL[provider] ?? provider;
        const isSignup =
          signupProvider === provider ||
          (!signupProvider && provider === providers[0]);
        return (
          <li key={provider} className="shrink-0">
            <span
              title={isSignup ? `${label}, 가입` : `${label}, 연동`}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full",
                PROVIDER_CIRCLE[provider] ?? "bg-surface-2 text-muted",
                !isSignup && "opacity-70",
              )}
            >
              {Icon ? (
                <Icon className="h-3.5 w-3.5" />
              ) : (
                <Mail className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              )}
              <span className="sr-only">{label}</span>
            </span>
          </li>
        );
      })}
      {overflow > 0 ? (
        <li className="shrink-0">
          <span
            className="flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-surface-2 px-1.5 text-xs font-semibold tabular-nums text-muted"
            title={providers
              .slice(maxVisible)
              .map((p) => PROVIDER_LABEL[p] ?? p)
              .join(", ")}
          >
            +{overflow}
          </span>
        </li>
      ) : null}
    </ul>
  );
}

function teamNamesPreview(
  memberships: { team: { name: string } }[],
  total: number,
) {
  const names = memberships.map((m) => m.team.name).filter(Boolean);
  if (names.length === 0) return `${total}곳`;
  if (names.length === 1 && total === 1) return names[0];
  if (names.length >= total) return names.slice(0, 2).join(", ");
  const shown = names.slice(0, 1);
  return `${shown[0]} 외 ${total - 1}`;
}

function signupProviderIcon(
  provider: string | null | undefined,
): ComponentType<{ className?: string; "aria-hidden"?: boolean }> {
  if (provider === "google") return GoogleIcon;
  if (provider === "naver") return NaverIcon;
  if (provider === "twitter") return XIcon;
  return Mail;
}

function signupProviderLabel(provider: string | null | undefined) {
  if (!provider) return "이메일 가입";
  return `${PROVIDER_LABEL[provider] ?? provider} 가입`;
}

function MetaRow({
  icon: Icon,
  label,
  value,
  expandable,
  iconClassName,
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  /** 길면 한 줄 생략, 클릭 시 전체 표시(카드 높이 증가) */
  expandable?: boolean;
  iconClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const iconSlot = (
    <span className="grid h-5 w-5 shrink-0 place-items-center self-center">
      <Icon
        className={cn("h-4 w-4 text-muted", iconClassName)}
        aria-hidden
      />
    </span>
  );

  if (!expandable) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        {iconSlot}
        <span className="sr-only">{label}</span>
        <span className="min-w-0 truncate text-base leading-5 text-muted-2">
          {value}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-label={expanded ? `${label} 접기` : `${label} 전체 보기`}
      title={expanded ? undefined : value}
      onClick={() => setExpanded((v) => !v)}
      className="flex min-h-12 min-w-0 items-center gap-2 py-1 text-left md:min-h-0 md:items-start md:py-0"
    >
      {iconSlot}
      <span className="sr-only">{label}</span>
      <span
        className={cn(
          "min-w-0 text-base leading-5 text-muted-2",
          expanded ? "break-all whitespace-normal" : "truncate",
        )}
      >
        {value}
      </span>
    </button>
  );
}

/** MD3 exposed menu 느낌의 커스텀 선택. */
function SortIconSelect({
  value,
  options,
  onChange,
  disabled,
}: {
  value: Sort;
  options: {
    value: Sort;
    label: string;
    icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  }[];
  onChange: (value: Sort) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: Sort) {
    setOpen(false);
    if (next !== value) onChange(next);
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        aria-label={`가입일 정렬, ${current.label}`}
        title={`가입일 ${current.label}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex h-12 w-12 items-center justify-center rounded-full text-muted transition-colors",
          "hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
          "max-md:h-14 max-md:w-14",
          open && "bg-surface text-foreground",
        )}
      >
        <ArrowUpDown className="h-5 w-5 max-md:h-6 max-md:w-6" aria-hidden />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="가입일 정렬"
          className="absolute right-0 z-30 mt-1.5 min-w-[8.5rem] overflow-hidden rounded-xl bg-card py-1 shadow-soft"
        >
          {options.map((opt) => {
            const selected = opt.value === value;
            const Icon = opt.icon;
            return (
              <li key={opt.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    choose(opt.value);
                  }}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-2.5 px-3 py-3 text-left text-base font-semibold md:min-h-0 md:py-2.5 md:text-sm",
                    selected
                      ? "bg-primary-soft text-primary"
                      : "text-foreground hover:bg-surface",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1">{opt.label}</span>
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

function UserCardMenu({
  disabled,
  items,
}: {
  disabled?: boolean;
  items: {
    id: string;
    label: string;
    onSelect: () => void;
    danger?: boolean;
  }[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className="absolute right-2 top-2 z-20">
      <button
        type="button"
        disabled={disabled}
        aria-label="사용자 작업"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-12 w-12 items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground disabled:opacity-50 md:h-9 md:w-9"
      >
        <MoreVertical className="h-6 w-6 md:h-5 md:w-5" aria-hidden />
      </button>
      {open ? (
        <ul
          id={listId}
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[9.5rem] overflow-hidden rounded-xl border border-border-strong bg-card py-1 shadow-soft"
        >
          {items.map((item) => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex min-h-12 w-full items-center px-4 py-3 text-left text-base font-semibold hover:bg-surface md:min-h-0 md:px-3 md:py-2.5 md:text-sm",
                  item.danger
                    ? "text-red-700 hover:bg-red-50"
                    : "text-foreground",
                )}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function normalizeTeamRow(raw: Partial<TeamRow> & { id?: string }): TeamRow {
  const createdAt =
    typeof raw.createdAt === "string" && raw.createdAt
      ? raw.createdAt
      : new Date().toISOString();
  const owner = raw.owner ?? {
    id: "",
    name: null,
    handle: null,
    email: null,
    disabled: false,
  };
  const managers = Array.isArray(raw.managers)
    ? raw.managers.map((m) => ({
        id: m.id || "",
        role: m.role === "OWNER" ? ("OWNER" as const) : ("ADMIN" as const),
        name: m.name ?? null,
        handle: m.handle ?? null,
        email: m.email ?? null,
        disabled: Boolean(m.disabled),
      }))
    : [];
  const pendingInvites = Array.isArray(raw.pendingInvites)
    ? raw.pendingInvites.map((inv) => ({
        email: inv.email ?? null,
        name: inv.name ?? null,
        handle: inv.handle ?? null,
      }))
    : [];
  return {
    id: raw.id || `team-${createdAt}`,
    name: raw.name?.trim() || "이름 없음",
    slug: raw.slug?.trim() || "-",
    plan: "TEAM",
    seatLimit: Number.isFinite(raw.seatLimit) ? Number(raw.seatLimit) : 0,
    memberCount: Number.isFinite(raw.memberCount) ? Number(raw.memberCount) : 0,
    adminCount: Number.isFinite(raw.adminCount)
      ? Number(raw.adminCount)
      : managers.length,
    pendingInviteCount: Number.isFinite(raw.pendingInviteCount)
      ? Number(raw.pendingInviteCount)
      : pendingInvites.length,
    meetingCount: Number.isFinite(raw.meetingCount)
      ? Number(raw.meetingCount)
      : 0,
    lastMeetingAt:
      typeof raw.lastMeetingAt === "string" && raw.lastMeetingAt
        ? raw.lastMeetingAt
        : null,
    createdAt,
    updatedAt:
      typeof raw.updatedAt === "string" && raw.updatedAt
        ? raw.updatedAt
        : createdAt,
    owner: {
      id: owner.id || "",
      name: owner.name ?? null,
      handle: owner.handle ?? null,
      email: owner.email ?? null,
      disabled: Boolean(owner.disabled),
    },
    managers,
    pendingInvites,
  };
}

function CopyIdButton({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      title={`${label} 복사`}
      aria-label={`${label} 복사`}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="inline-flex h-12 min-w-0 flex-1 items-center justify-between gap-2 rounded-xl bg-surface px-3 text-left transition-colors hover:bg-surface-2 md:h-10"
    >
      <span className="min-w-0">
        <span className="block text-base font-semibold text-muted md:text-sm">
          {label}
        </span>
        <span className="block truncate font-mono text-base tabular-nums text-foreground md:text-sm">
          {value}
        </span>
      </span>
      <span className="shrink-0 text-base font-semibold text-primary md:text-sm">
        {copied ? "복사됨" : "복사"}
      </span>
    </button>
  );
}

function emptyPreviewUser(i: number): UserRow {
  const providers = (
    [
      ["credentials"],
      ["google"],
      ["naver"],
      ["twitter"],
      ["google", "naver"],
      ["credentials", "google"],
      ["twitter", "google"],
    ] as const
  )[i % 7];
  const signup = providers[0];
  return {
    id: `ux-user-${i + 1}`,
    name: `미리보기 사용자 ${i + 1}`,
    email: `preview${i + 1}@example.com`,
    handle: `preview${i + 1}`,
    role: i % 5 === 0 ? "ADMIN" : "USER",
    plan: i % 3 === 0 ? "PRO" : "FREE",
    disabled: i % 7 === 0,
    signupProvider: signup,
    image: null,
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    teamEntitlement:
      i % 3 === 0 ? { remainingTeamSlots: 1, seatLimit: 5 } : null,
    accounts: providers.map((provider) => ({ provider })),
    teamMemberships:
      i % 4 === 0
        ? [{ role: "OWNER", team: { name: "미리보기 팀", slug: "preview" } }]
        : [],
    _count: { teamMemberships: i % 4 === 0 ? 1 : 0 },
  };
}

export function UsersAdminPanel({
  initialUsers,
  initialTotal,
  initialStats,
  initialPage,
  initialPageSize,
  currentUserId,
}: {
  initialUsers: UserRow[];
  initialTotal: number;
  initialStats: UserStats;
  initialPage: number;
  initialPageSize: number;
  currentUserId: string;
}) {
  const router = useRouter();
  const { scenarioId, isLive } = usePageUxPreview();
  const isNarrow = useIsNarrowMobile();
  const [users, setUsers] = useState(initialUsers);
  const [total, setTotal] = useState(initialTotal);
  const [stats, setStats] = useState(initialStats);
  const pageSize = isNarrow ? 3 : Math.max(initialPageSize, 9);
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [listQuery, setListQuery] = useState({
    q: "",
    filter: "all" as Filter,
    sort: "desc" as Sort,
    page: initialPage,
  });
  const [pane, setPane] = useState<UsersAdminMobilePane>("users");
  const section: "users" | "teams" | "audit" =
    pane === "filters" ? "users" : pane;
  const [auditLogs, setAuditLogs] = useState<AdminAuditRow[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditQuery, setAuditQuery] = useState("");
  const [auditDebouncedQuery, setAuditDebouncedQuery] = useState("");
  const [auditPeriod, setAuditPeriod] = useState<AuditPeriod>("week");
  const [auditFrom, setAuditFrom] = useState(() => {
    const range = periodRangeYmd("week");
    return range?.from ?? "";
  });
  const [auditTo, setAuditTo] = useState(() => {
    const range = periodRangeYmd("week");
    return range?.to ?? "";
  });
  const [auditAction, setAuditAction] = useState<AuditActionFilter>("all");
  const [changeDraft, setChangeDraft] = useState<AdminChangeDraft | null>(
    null,
  );
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamTotal, setTeamTotal] = useState(0);
  const [teamPage, setTeamPage] = useState(1);
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [teamQuery, setTeamQuery] = useState("");
  const [teamDebouncedQuery, setTeamDebouncedQuery] = useState("");
  const [teamMemberFilter, setTeamMemberFilter] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const isLocalDevelopment = process.env.NODE_ENV === "development";
  const skipFetchRef = useRef(true);
  const requestIdRef = useRef(0);
  const auditRequestIdRef = useRef(0);
  const teamRequestIdRef = useRef(0);
  const { q: debouncedQuery, filter, sort, page } = listQuery;
  const hasActiveFilter = Boolean(debouncedQuery) || filter !== "all";
  const auditPageSize = isNarrow ? 8 : 20;
  const auditTotalPages = Math.max(1, Math.ceil(auditTotal / auditPageSize));
  /** 가로 2열 × 1행 = 한 페이지 */
  const teamPageSize = 2;
  const pageSizePrevRef = useRef(pageSize);

  useEffect(() => {
    if (pageSizePrevRef.current === pageSize) return;
    pageSizePrevRef.current = pageSize;
    setListQuery((prev) =>
      prev.page === 1 ? prev : { ...prev, page: 1 },
    );
    setTeamPage(1);
    setAuditPage(1);
  }, [pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = query.trim();
      setListQuery((prev) => {
        if (prev.q === next) return prev;
        return { ...prev, q: next, page: 1 };
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = auditQuery.trim();
      setAuditDebouncedQuery((prev) => {
        if (prev === next) return prev;
        setAuditPage(1);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [auditQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = teamQuery.trim();
      setTeamDebouncedQuery((prev) => {
        if (prev === next) return prev;
        setTeamPage(1);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [teamQuery]);

  useEffect(() => {
    if (skipFetchRef.current) {
      skipFetchRef.current = false;
      // SSR pageSize(9)와 모바일(3)이 다르면 즉시 재요청
      if (pageSize === initialPageSize) return;
    }
    if (!isLive) return;

    const controller = new AbortController();
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      filter,
      sort,
    });
    if (debouncedQuery) params.set("q", debouncedQuery);

    void fetch(`/api/admin/users?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          ok: boolean;
          message?: string;
          users?: UserRow[];
          total?: number;
          page?: number;
          stats?: UserStats;
        };
        if (reqId !== requestIdRef.current) return;
        if (!data.ok || !data.users || data.total === undefined || !data.stats) {
          setError(data.message ?? "목록을 불러오지 못했습니다.");
          return;
        }
        setUsers(data.users);
        setTotal(data.total);
        setStats(data.stats);
        if (typeof data.page === "number") {
          setListQuery((prev) =>
            prev.page === data.page ? prev : { ...prev, page: data.page! },
          );
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (reqId !== requestIdRef.current) return;
        setError("목록을 불러오지 못했습니다.");
        void err;
      })
      .finally(() => {
        if (reqId === requestIdRef.current) setLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, filter, sort, page, pageSize, isLive]);

  useEffect(() => {
    if (section !== "audit") return;
    if (!isLive) return;

    const controller = new AbortController();
    const reqId = ++auditRequestIdRef.current;
    setAuditLoading(true);
    setAuditError("");

    const params = new URLSearchParams({
      page: String(auditPage),
      pageSize: String(auditPageSize),
      period: auditPeriod,
    });
    if (auditDebouncedQuery) params.set("q", auditDebouncedQuery);
    if (auditAction !== "all") params.set("action", auditAction);
    if (auditFrom) params.set("from", auditFrom);
    if (auditTo) params.set("to", auditTo);

    void fetch(`/api/admin/audit?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          ok: boolean;
          message?: string;
          logs?: AdminAuditRow[];
          total?: number;
          page?: number;
        };
        if (reqId !== auditRequestIdRef.current) return;
        if (!data.ok || !data.logs || data.total === undefined) {
          setAuditError(data.message ?? "감사 로그를 불러오지 못했습니다.");
          return;
        }
        setAuditLogs(data.logs);
        setAuditTotal(data.total);
        if (typeof data.page === "number") setAuditPage(data.page);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (reqId !== auditRequestIdRef.current) return;
        setAuditError("감사 로그를 불러오지 못했습니다.");
        void err;
      })
      .finally(() => {
        if (reqId === auditRequestIdRef.current) setAuditLoading(false);
      });

    return () => controller.abort();
  }, [
    section,
    auditPage,
    auditPageSize,
    auditPeriod,
    auditFrom,
    auditTo,
    auditAction,
    auditDebouncedQuery,
    isLive,
  ]);

  useEffect(() => {
    if (section !== "teams") return;
    if (!isLive) return;

    const controller = new AbortController();
    const reqId = ++teamRequestIdRef.current;
    setTeamLoading(true);
    setTeamError("");

    const params = new URLSearchParams({
      page: String(teamPage),
      pageSize: String(teamPageSize),
    });
    if (teamDebouncedQuery) params.set("q", teamDebouncedQuery);
    if (teamMemberFilter?.id) params.set("memberId", teamMemberFilter.id);

    void fetch(`/api/admin/teams?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          ok: boolean;
          message?: string;
          teams?: TeamRow[];
          total?: number;
          page?: number;
        };
        if (reqId !== teamRequestIdRef.current) return;
        if (!data.ok || !data.teams || data.total === undefined) {
          setTeamError(data.message ?? "팀 목록을 불러오지 못했습니다.");
          return;
        }
        setTeams(data.teams.map((t) => normalizeTeamRow(t)));
        setTeamTotal(data.total);
        if (typeof data.page === "number") setTeamPage(data.page);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (reqId !== teamRequestIdRef.current) return;
        setTeamError("팀 목록을 불러오지 못했습니다.");
        void err;
      })
      .finally(() => {
        if (reqId === teamRequestIdRef.current) setTeamLoading(false);
      });

    return () => controller.abort();
  }, [section, teamPage, teamDebouncedQuery, teamMemberFilter, isLive]);

  function openUserTeams(user: UserRow) {
    const label = user.name || user.handle || user.email || "사용자";
    setTeamMemberFilter({ id: user.id, label });
    setTeamQuery("");
    setTeamDebouncedQuery("");
    setTeamPage(1);
    setPane("teams");
  }

  function leaveUserTeamsView() {
    setTeamMemberFilter(null);
    setTeamQuery("");
    setTeamDebouncedQuery("");
    setTeamPage(1);
    setPane("users");
  }

  const viewUsers = useMemo(() => {
    if (scenarioId === "empty") return [];
    if (scenarioId === "full") {
      if (users.length >= pageSize) return users.slice(0, pageSize);
      const padded = [...users];
      for (let i = padded.length; i < pageSize; i += 1) {
        padded.push(emptyPreviewUser(i));
      }
      return padded;
    }
    return users.slice(0, pageSize);
  }, [scenarioId, users, pageSize]);

  const viewTeams = useMemo(() => {
    if (scenarioId === "empty") return fixtureAdminTeamsEmpty();
    if (scenarioId === "full") {
      return fixtureAdminTeamsFull(teamPageSize).map((t) =>
        normalizeTeamRow(t),
      );
    }
    return teams.map((t) => normalizeTeamRow(t)).slice(0, teamPageSize);
  }, [scenarioId, teams, teamPageSize]);

  const viewStats = useMemo(() => {
    if (scenarioId === "empty") {
      return { total: 0, admins: 0, pro: 0, paused: 0, noteam: 0 };
    }
    if (scenarioId === "full") {
      const padded =
        users.length >= pageSize
          ? users.slice(0, pageSize)
          : [
              ...users,
              ...Array.from(
                { length: pageSize - users.length },
                (_, i) => emptyPreviewUser(users.length + i),
              ),
            ];
      return {
        total: padded.filter((u) => u.role !== "ADMIN").length,
        admins: padded.filter((u) => u.role === "ADMIN").length,
        pro: padded.filter((u) => u.role !== "ADMIN" && u.plan === "PRO")
          .length,
        paused: padded.filter((u) => u.role !== "ADMIN" && u.disabled)
          .length,
        noteam: padded.filter(
          (u) =>
            u.role !== "ADMIN" && (u._count?.teamMemberships ?? 0) === 0,
        ).length,
      };
    }
    return stats;
  }, [scenarioId, stats, users, pageSize]);

  const viewTotal =
    scenarioId === "empty"
      ? 0
      : scenarioId === "full"
        ? pageSize
        : total;

  const viewTeamTotal =
    scenarioId === "empty"
      ? 0
      : scenarioId === "full"
        ? teamPageSize
        : teamTotal;

  if (scenarioId === "loading") {
    return (
      <div className="grid min-h-[min(32rem,70dvh)] w-full place-items-center rounded-3xl bg-card px-6 shadow-soft">
        <LoadingMark />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(viewTotal / pageSize));
  const viewTeamTotalPages = Math.max(
    1,
    Math.ceil(viewTeamTotal / teamPageSize),
  );

  function changeFilter(next: Filter) {
    setListQuery((prev) =>
      prev.filter === next ? prev : { ...prev, filter: next, page: 1 },
    );
  }

  function changeSort(next: Sort) {
    setListQuery((prev) =>
      prev.sort === next ? prev : { ...prev, sort: next, page: 1 },
    );
  }

  async function patchUser(
    userId: string,
    body: {
      role?: Role;
      plan?: Plan;
      disabled?: boolean;
      teamSlots?: number;
      teamSeatLimit?: number;
      reason?: string;
      until?: string | null;
      adminConfirm?: string | null;
    },
  ) {
    setError("");
    const prevSnapshot = users.find((u) => u.id === userId);
    if (prevSnapshot) {
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== userId) return u;
          return {
            ...u,
            ...(body.role !== undefined ? { role: body.role } : {}),
            ...(body.plan !== undefined ? { plan: body.plan } : {}),
            ...(body.disabled !== undefined ? { disabled: body.disabled } : {}),
            ...(body.teamSlots !== undefined || body.teamSeatLimit !== undefined
              ? {
                  teamEntitlement: {
                    remainingTeamSlots:
                      body.teamSlots ??
                      u.teamEntitlement?.remainingTeamSlots ??
                      0,
                    seatLimit:
                      body.teamSeatLimit ?? u.teamEntitlement?.seatLimit ?? 0,
                  },
                }
              : {}),
          };
        }),
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
                planUntil:
                  data.user!.planUntil !== undefined
                    ? data.user!.planUntil
                    : u.planUntil,
                disabledUntil:
                  data.user!.disabledUntil !== undefined
                    ? data.user!.disabledUntil
                    : u.disabledUntil,
                handle: data.user!.handle ?? u.handle,
                teamEntitlement:
                  data.user!.teamEntitlement !== undefined
                    ? data.user!.teamEntitlement
                    : u.teamEntitlement,
                teamMemberships:
                  data.user!.teamMemberships ?? u.teamMemberships,
                _count: data.user!._count ?? u._count,
              }
            : u,
        ),
      );
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

  function openUserChange(draft: AdminChangeDraft) {
    setChangeDraft(draft);
  }

  async function confirmUserChange(payload: {
    reason: string;
    until: string | null;
    adminConfirm: string | null;
  }) {
    if (!changeDraft) return;
    const draft = changeDraft;
    setChangeDraft(null);
    if (draft.kind === "plan") {
      await patchUser(draft.userId, {
        plan: draft.value as Plan,
        reason: payload.reason,
        until: payload.until,
      });
      return;
    }
    if (draft.kind === "role") {
      await patchUser(draft.userId, {
        role: draft.value as Role,
        reason: payload.reason,
        adminConfirm: payload.adminConfirm,
      });
      return;
    }
    await patchUser(draft.userId, {
      disabled: Boolean(draft.value),
      reason: payload.reason,
      until: payload.until,
    });
  }

  const sectionRows = viewUsers;

  function selectPane(next: UsersAdminMobilePane) {
    setPane(next);
    if (next === "users" && teamMemberFilter) {
      setTeamMemberFilter(null);
      setTeamPage(1);
    }
    if (next === "teams") {
      setTeamMemberFilter(null);
      setTeamPage(1);
    }
    if (next === "audit") {
      setAuditPage(1);
    }
  }

  function applyFilterAndShowUsers(next: Filter) {
    changeFilter(next);
    setPane("users");
  }

  return (
    <div className="flex flex-col gap-6 pb-[calc(env(safe-area-inset-bottom,0px)+11rem)] md:pb-0">
      {/* Desktop tabs */}
      <div className="hidden items-end border-b border-border md:flex">
        <div
          role="tablist"
          aria-label="사용자 관리 분류"
          className="flex min-w-0 flex-wrap gap-x-6"
        >
          {(
            [
              { id: "users" as const, label: "사용자" },
              { id: "teams" as const, label: "팀 목록" },
              { id: "audit" as const, label: "감사" },
            ] as const
          ).map((item) => {
            const selected = pane === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setPane(item.id);
                  if (item.id === "users") {
                    setListQuery((prev) =>
                      prev.filter === "all"
                        ? prev
                        : { ...prev, filter: "all", page: 1 },
                    );
                  }
                  if (item.id === "teams") {
                    setTeamMemberFilter(null);
                    setTeamPage(1);
                  }
                  if (item.id === "audit") {
                    setAuditPage(1);
                  }
                }}
                className={cn(
                  "shrink-0 border-b-2 px-0.5 pb-3 pt-1 text-sm transition-colors",
                  selected
                    ? "border-foreground font-semibold text-foreground"
                    : "border-transparent font-semibold text-muted hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {pane === "audit" ? (
        <div className="relative flex flex-col gap-4" role="tabpanel">
          <AuditSearchField
            value={auditQuery}
            onChange={setAuditQuery}
            onClear={() => setAuditQuery("")}
          />

          <div className="flex flex-col gap-3">
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="기간 빠른 선택"
            >
              {AUDIT_PERIOD_OPTIONS.map((item) => {
                const range = periodRangeYmd(item.id);
                const active =
                  item.id === "all"
                    ? !auditFrom && !auditTo
                    : Boolean(
                        range &&
                          range.from === auditFrom &&
                          range.to === auditTo,
                      );
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setAuditPeriod(item.id);
                      const next = periodRangeYmd(item.id);
                      setAuditFrom(next?.from ?? "");
                      setAuditTo(next?.to ?? "");
                      setAuditPage(1);
                    }}
                    className={cn(
                      "inline-flex h-12 min-w-12 items-center justify-center rounded-full px-4 text-base font-semibold md:h-10 md:px-3.5",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted ring-1 ring-inset ring-border-strong",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <AuditRangeCalendar
              from={auditFrom}
              to={auditTo}
              onChange={(nextFrom, nextTo) => {
                setAuditFrom(nextFrom);
                setAuditTo(nextTo);
                setAuditPage(1);
              }}
            />

            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="종류"
            >
              {AUDIT_ACTION_OPTIONS.map((item) => {
                const active = auditAction === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setAuditAction(item.id);
                      setAuditPage(1);
                    }}
                    className={cn(
                      "inline-flex h-12 min-w-12 items-center justify-center rounded-full px-4 text-base font-semibold md:h-10 md:px-3.5",
                      active
                        ? "bg-primary-soft text-primary"
                        : "text-muted ring-1 ring-inset ring-border-strong",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-base text-muted">
            {auditTotal}건{auditLoading ? ", 불러오는 중" : ""}
          </p>

          {auditError ? (
            <p className="text-base text-muted">{auditError}</p>
          ) : null}
          {auditLoading ? (
            <div className="absolute right-0 top-14 z-20 rounded-full bg-background/95 px-3 py-1.5 shadow-soft">
              <LoadingMark size="sm" />
            </div>
          ) : null}
          {auditLogs.length === 0 && !auditLoading ? (
            <div className="grid place-items-center rounded-xl bg-surface px-6 py-12">
              <p className="text-lg font-semibold text-foreground">
                {auditDebouncedQuery ||
                auditAction !== "all" ||
                auditFrom ||
                auditTo
                  ? "조건에 맞는 기록이 없습니다"
                  : "감사 기록이 없습니다"}
              </p>
            </div>
          ) : (
            <ul
              className={cn(
                "divide-y divide-border/60 rounded-xl ring-1 ring-border",
                auditLoading && "opacity-55",
              )}
            >
              {auditLogs.map((log) => {
                const change = auditChangeParts(log.action, log.metadata);
                const actor = personLabel(log.actor);
                const target = personLabel(log.targetUser);
                return (
                  <li key={log.id} className="px-4 py-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-lg font-semibold text-foreground">
                        {ADMIN_AUDIT_ACTION_LABEL[log.action] ?? log.action}
                      </span>
                      <time
                        className="shrink-0 text-base tabular-nums text-muted"
                        dateTime={log.createdAt}
                      >
                        {formatAuditWhen(log.createdAt)}
                      </time>
                    </div>

                    <div className="mt-3 flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate text-base font-semibold text-foreground">
                        {actor}
                      </span>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 text-muted-2"
                        strokeWidth={2}
                        aria-label="대상"
                      />
                      <span className="min-w-0 truncate text-base font-semibold text-foreground">
                        {target}
                      </span>
                    </div>

                    {change ? (
                      <AuditChangeFlow
                        before={change.before}
                        after={change.after}
                        penalty={change.penalty}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {auditTotal > 0 ? (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={auditPage <= 1 || auditLoading}
                onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-12 items-center gap-1 rounded-full px-4 text-base font-semibold ring-1 ring-inset ring-border-strong disabled:opacity-40 md:h-10 md:text-sm"
              >
                <ChevronLeft className="h-5 w-5 md:h-4 md:w-4" aria-hidden />
                이전
              </button>
              <span className="min-w-[3.5rem] text-center text-base font-semibold tabular-nums text-muted md:text-sm">
                {auditPage} / {auditTotalPages}
              </span>
              <button
                type="button"
                disabled={auditPage >= auditTotalPages || auditLoading}
                onClick={() => setAuditPage((p) => p + 1)}
                className="inline-flex h-12 items-center gap-1 rounded-full px-4 text-base font-semibold ring-1 ring-inset ring-border-strong disabled:opacity-40 md:h-10 md:text-sm"
              >
                다음
                <ChevronRight className="h-5 w-5 md:h-4 md:w-4" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      ) : pane === "teams" ? (
        <div className="relative flex flex-col gap-4" role="tabpanel">
          <div className="flex flex-col gap-3">
            {teamMemberFilter ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={leaveUserTeamsView}
                  className="inline-flex h-12 items-center gap-1.5 rounded-full px-4 text-base font-semibold text-foreground ring-1 ring-inset ring-border-strong transition-colors hover:bg-surface md:h-10 md:px-3 md:text-sm"
                >
                  <ChevronLeft className="h-5 w-5 md:h-4 md:w-4" aria-hidden />
                  돌아가기
                </button>
                <span className="inline-flex h-12 max-w-full items-center gap-1.5 rounded-full bg-primary-soft px-4 text-base font-semibold text-primary md:h-10 md:px-3">
                  <span className="min-w-0 truncate">
                    {teamMemberFilter.label}님의 팀
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTeamMemberFilter(null);
                      setTeamPage(1);
                    }}
                    className="grid min-h-12 min-w-12 shrink-0 place-items-center rounded-full hover:bg-primary/10 md:h-5 md:min-h-5 md:w-5 md:min-w-5"
                    aria-label="멤버 필터 해제"
                  >
                    <X className="h-4 w-4 md:h-3.5 md:w-3.5" aria-hidden />
                  </button>
                </span>
              </div>
            ) : null}
            <label className="relative min-w-0 w-full">
              <span className="sr-only">팀 검색</span>
              <Search
                className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                type="search"
                value={teamQuery}
                onChange={(e) => setTeamQuery(e.target.value)}
                placeholder="팀 이름, 슬러그, 대표"
                className="h-14 w-full rounded-full bg-surface-2 py-2 pl-12 pr-11 text-lg text-foreground outline-none transition-colors placeholder:text-muted-2 focus:bg-[#dcdee4] md:h-12 md:text-base"
              />
              {teamQuery ? (
                <button
                  type="button"
                  onClick={() => setTeamQuery("")}
                  className="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground md:h-8 md:w-8"
                  aria-label="검색어 지우기"
                >
                  <X className="h-5 w-5 md:h-4 md:w-4" aria-hidden />
                </button>
              ) : null}
            </label>
          </div>

          {teamError ? (
            <p className="text-base text-muted">{teamError}</p>
          ) : null}
          {teamLoading ? (
            <div className="absolute right-0 top-14 z-20 rounded-full bg-background/95 px-3 py-1.5 shadow-soft">
              <LoadingMark size="sm" />
            </div>
          ) : null}

          {viewTeams.length === 0 && !teamLoading ? (
            <div className="grid place-items-center rounded-xl bg-surface px-6 py-16">
              <div className="flex max-w-sm flex-col items-center gap-3 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-muted">
                  <UsersRound className="h-6 w-6" aria-hidden />
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {teamDebouncedQuery || teamMemberFilter
                    ? "조건에 맞는 팀이 없습니다"
                    : "등록된 팀이 없습니다"}
                </p>
              </div>
            </div>
          ) : (
            <ul
              className={cn(
                "grid grid-cols-2 items-start gap-3 md:gap-4",
                "transition-opacity duration-150",
                teamLoading && "opacity-55",
              )}
            >
              {viewTeams.map((t) => {
                const ownerLabel =
                  t.owner.name ||
                  (t.owner.handle ? `@${t.owner.handle}` : "대표 없음");
                const memberCount = Number(t.memberCount) || 0;
                const seatLimit = Math.max(Number(t.seatLimit) || 0, 0);
                const seatLeft = Math.max(0, seatLimit - memberCount);
                const seatPct =
                  seatLimit > 0
                    ? Math.min(100, Math.round((memberCount / seatLimit) * 100))
                    : 0;
                const seatFull = seatLimit > 0 && seatLeft === 0;
                const adminCount = Number(t.adminCount) || 0;
                const pendingInviteCount = Number(t.pendingInviteCount) || 0;
                const meetingCount = Number(t.meetingCount) || 0;
                const created = new Date(t.createdAt).toLocaleDateString(
                  "ko-KR",
                );
                const updated = new Date(t.updatedAt).toLocaleDateString(
                  "ko-KR",
                );
                const lastMeeting = t.lastMeetingAt
                  ? new Date(t.lastMeetingAt).toLocaleDateString("ko-KR")
                  : "아직 없음";
                return (
                  <li key={t.id} className="min-h-0">
                    <article className="flex h-full flex-col gap-4 rounded-xl bg-background px-4 py-4 ring-1 ring-border">
                      <header className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-semibold text-foreground">
                            {t.name}
                          </h3>
                          <p className="mt-0.5 truncate text-base text-muted-2">
                            {t.slug}
                          </p>
                        </div>
                        <span className="inline-flex h-7 shrink-0 items-center rounded-full bg-primary-soft px-2.5 text-sm font-semibold text-primary">
                          Team
                        </span>
                      </header>

                      <section className="rounded-xl bg-surface px-3 py-3">
                        <p className="text-sm font-semibold text-muted">대표</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-foreground">
                            {ownerLabel}
                          </p>
                          {t.owner.disabled ? (
                            <span className="inline-flex h-7 items-center rounded-full bg-red-50 px-2.5 text-sm font-semibold text-red-700">
                              계정 정지
                            </span>
                          ) : null}
                        </div>
                        {t.owner.email ? (
                          <p className="mt-0.5 truncate text-base text-muted-2">
                            {t.owner.email}
                          </p>
                        ) : null}
                        {t.owner.handle ? (
                          <p className="mt-0.5 truncate text-base text-muted-2">
                            @{t.owner.handle}
                          </p>
                        ) : null}
                      </section>

                      <section>
                        <div className="flex items-end justify-between gap-2">
                          <p className="text-sm font-semibold text-muted">
                            멤버와 좌석
                          </p>
                          <p className="text-base font-semibold tabular-nums text-foreground">
                            {memberCount}
                            <span className="font-medium text-muted">
                              {" "}
                              / {seatLimit}석
                            </span>
                          </p>
                        </div>
                        <div
                          className="mt-2 h-2.5 overflow-hidden rounded-full bg-surface-2"
                          role="meter"
                          aria-label="좌석 사용"
                          aria-valuemin={0}
                          aria-valuemax={seatLimit || 100}
                          aria-valuenow={memberCount}
                        >
                          <div
                            className={cn(
                              "h-full rounded-full transition-[width]",
                              seatFull ? "bg-red-600" : "bg-primary",
                            )}
                            style={{ width: `${seatPct}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-base text-muted-2">
                          {seatLimit === 0
                            ? "좌석 정보 없음"
                            : seatFull
                              ? "빈 자리 없음"
                              : `빈 자리 ${seatLeft}석`}
                        </p>
                      </section>

                      <section className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl bg-surface px-2.5 py-3 text-center">
                          <p className="text-sm font-semibold text-muted">
                            관리자
                          </p>
                          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                            {adminCount}
                            <span className="text-base font-medium text-muted">
                              명
                            </span>
                          </p>
                        </div>
                        <div className="rounded-xl bg-surface px-2.5 py-3 text-center">
                          <p className="text-sm font-semibold text-muted">
                            초대 대기
                          </p>
                          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                            {pendingInviteCount}
                            <span className="text-base font-medium text-muted">
                              명
                            </span>
                          </p>
                        </div>
                        <div className="rounded-xl bg-surface px-2.5 py-3 text-center">
                          <p className="text-sm font-semibold text-muted">
                            팀 회의
                          </p>
                          <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                            {meetingCount}
                            <span className="text-base font-medium text-muted">
                              건
                            </span>
                          </p>
                        </div>
                      </section>

                      <section className="flex flex-col gap-2">
                        <p className="text-sm font-semibold text-muted">
                          복구, 문의용 ID
                        </p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <CopyIdButton label="팀 ID" value={t.id} />
                          <CopyIdButton label="대표 ID" value={t.owner.id} />
                        </div>
                        <CopyIdButton label="팀 주소(slug)" value={t.slug} />
                      </section>

                      {t.managers.length > 0 ? (
                        <section className="flex flex-col gap-2">
                          <p className="text-sm font-semibold text-muted">
                            관리 연락처
                          </p>
                          <ul className="flex flex-col gap-2">
                            {t.managers.map((m) => {
                              const label =
                                m.name ||
                                (m.handle ? `@${m.handle}` : m.email) ||
                                "이름 없음";
                              return (
                                <li
                                  key={`${m.id}-${m.role}`}
                                  className="rounded-xl bg-surface px-3 py-2.5"
                                >
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex h-7 items-center rounded-full bg-primary-soft px-2.5 text-sm font-semibold text-primary">
                                      {m.role === "OWNER" ? "대표" : "팀장"}
                                    </span>
                                    {m.disabled ? (
                                      <span className="inline-flex h-7 items-center rounded-full bg-red-50 px-2.5 text-sm font-semibold text-red-700">
                                        계정 정지
                                      </span>
                                    ) : null}
                                    <span className="text-base font-semibold text-foreground">
                                      {label}
                                    </span>
                                  </div>
                                  {m.email ? (
                                    <p className="mt-1 truncate text-base text-muted-2">
                                      {m.email}
                                    </p>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ) : null}

                      {t.pendingInvites.length > 0 ? (
                        <section className="flex flex-col gap-2">
                          <p className="text-sm font-semibold text-muted">
                            초대 대기 대상
                          </p>
                          <ul className="flex flex-col gap-1.5">
                            {t.pendingInvites.map((inv, idx) => {
                              const label =
                                inv.name ||
                                (inv.handle ? `@${inv.handle}` : null) ||
                                inv.email ||
                                "대상 없음";
                              return (
                                <li
                                  key={`${inv.email ?? inv.handle ?? idx}`}
                                  className="rounded-xl bg-surface px-3 py-2 text-base"
                                >
                                  <span className="font-semibold text-foreground">
                                    {label}
                                  </span>
                                  {inv.email && inv.email !== label ? (
                                    <span className="mt-0.5 block truncate text-muted-2">
                                      {inv.email}
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ul>
                        </section>
                      ) : null}

                      <footer className="grid gap-2 border-t border-border/60 pt-3 text-base">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">만든 날</span>
                          <span className="font-semibold tabular-nums text-foreground">
                            {created}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">최근 회의</span>
                          <span className="font-semibold tabular-nums text-foreground">
                            {lastMeeting}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted">정보 갱신</span>
                          <span className="font-semibold tabular-nums text-foreground">
                            {updated}
                          </span>
                        </div>
                      </footer>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}

          {viewTeamTotal > 0 ? (
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                disabled={teamPage <= 1 || teamLoading}
                onClick={() => setTeamPage((p) => Math.max(1, p - 1))}
                className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-foreground ring-1 ring-inset ring-border-strong disabled:opacity-40 max-md:h-12 max-md:px-4 max-md:text-base"
              >
                <ChevronLeft className="h-4 w-4 max-md:h-5 max-md:w-5" aria-hidden />
                이전
              </button>
              <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums text-muted max-md:text-base">
                {teamPage} / {viewTeamTotalPages}
              </span>
              <button
                type="button"
                disabled={teamPage >= viewTeamTotalPages || teamLoading}
                onClick={() => setTeamPage((p) => p + 1)}
                className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-foreground ring-1 ring-inset ring-border-strong disabled:opacity-40 max-md:h-12 max-md:px-4 max-md:text-base"
              >
                다음
                <ChevronRight className="h-4 w-4 max-md:h-5 max-md:w-5" aria-hidden />
              </button>
            </div>
          ) : null}
        </div>
      ) : pane === "filters" ? (
        <div className="flex flex-col gap-5" role="tabpanel">
          <div>
            <h2 className="text-lg font-semibold text-foreground">카테고리</h2>
            <p className="mt-1 text-base text-muted">선택하면 사용자 목록으로 이동합니다</p>
          </div>
          <div
            className="flex flex-col gap-3"
            role="group"
            aria-label="사용자 필터"
          >
            <StatChip
              size="lg"
              label="전체"
              value={viewStats.total}
              active={filter === "all"}
              onClick={() => applyFilterAndShowUsers("all")}
            />
            <StatChip
              size="lg"
              label="관리자"
              value={viewStats.admins}
              active={filter === "admin"}
              onClick={() => applyFilterAndShowUsers("admin")}
            />
            <StatChip
              size="lg"
              label="PRO"
              value={viewStats.pro}
              active={filter === "pro"}
              onClick={() => applyFilterAndShowUsers("pro")}
            />
            <StatChip
              size="lg"
              label="정지"
              value={viewStats.paused}
              muted={viewStats.paused === 0}
              active={filter === "paused"}
              tone="danger"
              onClick={() => applyFilterAndShowUsers("paused")}
            />
            <StatChip
              size="lg"
              label="미가입"
              value={viewStats.noteam}
              muted={viewStats.noteam === 0}
              active={filter === "noteam"}
              onClick={() => applyFilterAndShowUsers("noteam")}
            />
          </div>
        </div>
      ) : (
        <>
      {/* Region: filters + tools (related controls) */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-[16rem]">
            <span className="sr-only">사용자 검색</span>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름, 이메일, 핸들"
              className="h-14 w-full rounded-full bg-surface-2 py-2 pl-12 pr-11 text-lg text-foreground outline-none transition-colors placeholder:text-muted-2 focus:bg-[#dcdee4] md:h-12 md:text-base"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground md:h-8 md:w-8"
                aria-label="검색어 지우기"
              >
                <X className="h-5 w-5 md:h-4 md:w-4" aria-hidden />
              </button>
            ) : null}
          </label>
          <SortIconSelect
            value={sort}
            options={SORT_OPTIONS}
            disabled={loading || pending}
            onChange={changeSort}
          />
        </div>

        <div className="hidden flex-wrap items-center justify-end gap-x-3 gap-y-2 md:flex">
            {hasActiveFilter ? (
              <p className="mr-auto text-base font-medium text-muted">
                {viewTotal}명 표시
                {loading ? ", 불러오는 중" : ""}
              </p>
            ) : null}
            <div
              className="flex flex-wrap items-center justify-end gap-2"
              role="group"
              aria-label="사용자 필터"
            >
              <StatChip
                label="전체"
                value={viewStats.total}
                active={filter === "all"}
                onClick={() => changeFilter("all")}
              />
              <StatChip
                label="관리자"
                value={viewStats.admins}
                active={filter === "admin"}
                onClick={() => changeFilter("admin")}
              />
              <StatChip
                label="PRO"
                value={viewStats.pro}
                active={filter === "pro"}
                onClick={() => changeFilter("pro")}
              />
              <StatChip
                label="정지"
                value={viewStats.paused}
                muted={viewStats.paused === 0}
                active={filter === "paused"}
                tone="danger"
                onClick={() => changeFilter("paused")}
              />
              <StatChip
                label="미가입"
                value={viewStats.noteam}
                muted={viewStats.noteam === 0}
                active={filter === "noteam"}
                onClick={() => changeFilter("noteam")}
              />
            </div>
        </div>
        {hasActiveFilter ? (
          <p className="text-base font-medium text-muted md:hidden">
            {viewTotal}명 표시
            {loading ? ", 불러오는 중" : ""}
          </p>
        ) : null}
      </div>

      {error ? <p className="text-base text-muted">{error}</p> : null}

      {/* Region: card collection (feed) */}
      <div className="relative flex flex-col gap-4" role="tabpanel">
        {loading ? (
          <div className="absolute right-0 top-0 z-20 rounded-full bg-background/95 px-3 py-1.5 shadow-soft">
            <LoadingMark size="sm" />
          </div>
        ) : null}

        {sectionRows.length === 0 ? (
          <div className="grid place-items-center rounded-xl bg-surface px-6 py-16">
            <div className="flex max-w-sm flex-col items-center gap-3 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-muted">
                <Users className="h-6 w-6" aria-hidden />
              </div>
              <p className="text-lg font-semibold text-foreground">
                {hasActiveFilter
                  ? "조건에 맞는 사용자가 없습니다"
                  : "등록된 사용자가 없습니다"}
              </p>
            </div>
          </div>
        ) : (
          <ul
            className={cn(
              "grid grid-cols-1 items-start gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3",
              "transition-opacity duration-150",
              loading && "opacity-55",
            )}
          >
            {sectionRows.map((u) => {
              const isSelf = u.id === currentUserId;
              const providers = providerList(u);
              const joined = new Date(u.createdAt).toLocaleDateString("ko-KR");
              const teamCount = u._count?.teamMemberships ?? 0;
              const hasTeams = teamCount > 0;
              const belonging = hasTeams
                  ? teamNamesPreview(u.teamMemberships ?? [], teamCount)
                  : "미가입";
              const tier = tierOf(u);
              const userLabel =
                u.name || u.handle || u.email || "사용자";
              const menuItems = [
                // 소속 팀이 있을 때만
                ...(hasTeams
                  ? [
                      {
                        id: "view-teams",
                        label: "팀 보기",
                        onSelect: () => openUserTeams(u),
                      },
                    ]
                  : []),
                ...(!isSelf
                  ? [
                      ...(u.role !== "ADMIN"
                        ? [
                            {
                              id: "plan",
                              label: "등급 변경",
                              onSelect: () =>
                                openUserChange({
                                  userId: u.id,
                                  userLabel,
                                  kind: "plan" as const,
                                  title: "등급 변경",
                                  summary:
                                    u.plan === "PRO"
                                      ? "PRO → FREE"
                                      : "FREE → PRO",
                                  value: u.plan === "PRO" ? "FREE" : "PRO",
                                  needsAdminSecurity: false,
                                  needsPeriod: u.plan !== "PRO",
                                }),
                            },
                          ]
                        : []),
                      {
                        id: "role",
                        label: "관리등급 변경",
                        onSelect: () =>
                          openUserChange({
                            userId: u.id,
                            userLabel,
                            kind: "role" as const,
                            title: "관리등급 변경",
                            summary:
                              u.role === "ADMIN"
                                ? "관리자 → 사용자"
                                : "사용자 → 관리자",
                            value: u.role === "ADMIN" ? "USER" : "ADMIN",
                            needsAdminSecurity: true,
                            needsPeriod: false,
                          }),
                      },
                      {
                        id: "suspend",
                        label: u.disabled ? "정지 해제" : "정지",
                        danger: !u.disabled,
                        onSelect: () =>
                          openUserChange({
                            userId: u.id,
                            userLabel,
                            kind: "suspend" as const,
                            title: u.disabled ? "정지 해제" : "계정 정지",
                            summary: u.disabled
                              ? "정지 → 사용"
                              : "사용 → 정지",
                            value: !u.disabled,
                            needsAdminSecurity: false,
                            needsPeriod: !u.disabled,
                          }),
                      },
                    ]
                  : []),
              ];

              return (
                <li key={u.id} className="min-h-0">
                  <article
                    className={cn(
                      "relative flex h-full flex-col overflow-hidden rounded-xl bg-background ring-1",
                      u.disabled ? "ring-red-500" : "ring-border",
                    )}
                  >
                    <UserCardMenu
                      disabled={pending || loading}
                      items={menuItems}
                    />

                    {/* Identity: profile + social centered, meta left */}
                    <div className="flex flex-col px-4 pb-4 pt-5 md:pb-3">
                      <div className="flex flex-col items-center text-center">
                        <div className="relative">
                          <Avatar className="h-12 w-12 shrink-0 ring-1 ring-border">
                            {u.image ? (
                              <AvatarImage src={u.image} alt="" />
                            ) : null}
                            <AvatarFallback className="bg-white text-base font-semibold text-foreground">
                              {initialsOf(u.name, u.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span
                            className={cn(
                              "absolute bottom-0 left-[calc(100%-1.25rem)] z-10 inline-flex translate-y-1/4 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none tracking-wide ring-2 ring-background",
                              TIER_BADGE[tier],
                            )}
                          >
                            {tier}
                          </span>
                        </div>

                        <div className="mt-2 flex max-w-full items-center justify-center gap-1.5">
                          <h3
                            className={cn(
                              "truncate text-lg font-semibold leading-snug text-foreground",
                              u.disabled && "text-muted",
                            )}
                          >
                            {u.name || "이름 없음"}
                          </h3>
                          {isSelf ? (
                            <span className="shrink-0 rounded-full bg-primary-soft px-1.5 py-0.5 text-sm font-semibold text-primary">
                              나
                            </span>
                          ) : null}
                          {u.disabled ? (
                            <span className="shrink-0 rounded-full bg-red-50 px-1.5 py-0.5 text-sm font-semibold text-red-700">
                              정지
                            </span>
                          ) : null}
                        </div>

                        <ProviderIcons
                          className="mt-2.5"
                          providers={providers}
                          signupProvider={u.signupProvider}
                        />
                      </div>

                      <div className="mt-3 flex w-full flex-col gap-1.5 text-left">
                        <MetaRow
                          icon={IdCard}
                          label="아이디"
                          value={u.handle ? `@${u.handle}` : "아이디 없음"}
                        />
                        <MetaRow
                          icon={signupProviderIcon(u.signupProvider)}
                          label={signupProviderLabel(u.signupProvider)}
                          value={u.email || "이메일 없음"}
                          expandable={Boolean(u.email)}
                          iconClassName={
                            u.signupProvider === "naver"
                              ? "text-[#03C75A]"
                              : u.signupProvider === "twitter"
                                ? "text-foreground"
                                : u.signupProvider === "google"
                                  ? "text-foreground"
                                  : undefined
                          }
                        />
                        <MetaRow
                          icon={UsersRound}
                          label="소속"
                          value={belonging}
                        />
                        <MetaRow
                          icon={CalendarDays}
                          label="가입일"
                          value={joined}
                        />
                      </div>
                    </div>

                    {/* Actions */}
                    {isSelf &&
                    isLocalDevelopment &&
                    u.plan !== "PRO" ? (
                      <div className="mt-auto px-4 pb-3 pt-1">
                        <button
                          type="button"
                          disabled={pending || loading}
                          onClick={() =>
                            void patchUser(u.id, {
                              plan: "PRO",
                              teamSlots: 1,
                              teamSeatLimit: 5,
                              reason: "로컬 개발용 팀 테스트 활성화",
                              until: new Date(
                                Date.now() + 365 * 86400000,
                              ).toISOString(),
                            })
                          }
                          className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-primary px-4 text-base font-semibold text-primary-foreground disabled:opacity-50"
                        >
                          로컬 팀 테스트 활성화
                        </button>
                      </div>
                    ) : (
                      <div className="mt-auto pb-3" aria-hidden />
                    )}
                  </article>
                </li>
              );
            })}
          </ul>
        )}

        {viewTotal > 0 ? (
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              disabled={page <= 1 || loading || pending}
              onClick={() =>
                setListQuery((prev) => ({
                  ...prev,
                  page: Math.max(1, prev.page - 1),
                }))
              }
              className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-foreground ring-1 ring-inset ring-border-strong disabled:opacity-40 max-md:h-12 max-md:px-4 max-md:text-base"
            >
              <ChevronLeft className="h-4 w-4 max-md:h-5 max-md:w-5" aria-hidden />
              이전
            </button>
            <span className="min-w-[3.5rem] text-center text-sm font-semibold tabular-nums text-muted max-md:text-base">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading || pending}
              onClick={() =>
                setListQuery((prev) => ({ ...prev, page: prev.page + 1 }))
              }
              className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-foreground ring-1 ring-inset ring-border-strong disabled:opacity-40 max-md:h-12 max-md:px-4 max-md:text-base"
            >
              다음
              <ChevronRight className="h-4 w-4 max-md:h-5 max-md:w-5" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>
        </>
      )}

      <UsersAdminMobileRail active={pane} onChange={selectPane} />

      <UserAdminChangeDialog
        draft={changeDraft}
        pending={pending}
        onCancel={() => setChangeDraft(null)}
        onConfirm={(payload) => {
          void confirmUserChange(payload);
        }}
      />
    </div>
  );
}

function StatChip({
  label,
  value,
  muted,
  active,
  tone,
  size = "md",
  onClick,
}: {
  label: string;
  value: number;
  muted?: boolean;
  active?: boolean;
  tone?: "danger";
  size?: "md" | "lg";
  onClick: () => void;
}) {
  const danger = tone === "danger";
  const large = size === "lg";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full transition-colors",
        large
          ? "h-14 w-full justify-between px-5 text-lg"
          : "min-h-12 px-3.5 text-base md:h-8 md:min-h-8",
        active
          ? danger
            ? "bg-red-600 text-white"
            : "bg-primary text-primary-foreground"
          : danger
            ? "bg-transparent text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50"
            : "bg-transparent text-foreground ring-1 ring-inset ring-border-strong hover:bg-surface",
        muted && !active && !danger && "text-muted",
        muted && !active && danger && "text-red-400 ring-red-100",
      )}
    >
      <span
        className={cn(
          "font-medium",
          active
            ? danger
              ? "text-white/85"
              : "text-primary-foreground/85"
            : danger
              ? "text-red-600"
              : "text-muted",
        )}
      >
        {label}
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </button>
  );
}
