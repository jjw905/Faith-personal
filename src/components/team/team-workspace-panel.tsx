"use client";

import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  LayoutGrid,
  List,
  LoaderCircle,
  Megaphone,
  Mic,
  Pencil,
  Plus,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { MeetingSearch } from "@/components/dashboard/meeting-search";
import {
  TeamMeetingComposer,
  type TeamMeetingComposerValues,
} from "@/components/team/team-meeting-composer";
import { TeamManagePanel } from "@/components/team/team-manage-panel";
import { TeamSheet } from "@/components/team/team-sheet";
import {
  UpcomingMeetingGridCard,
  UpcomingMeetingRow,
} from "@/components/team/upcoming-meeting-row";
import type { ParticipantOption } from "@/components/team/participant-chip-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  TEAM_PREVIEW_ROLE_LABEL,
  useTeamRolePreview,
  type TeamPreviewRole,
} from "@/context/team-role-preview-context";
import { clientGet, invalidateClientFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

type PreviewRole = TeamPreviewRole;
type SectionLayout = "list" | "grid";

const TEAM_SECTION_LAYOUT_KEYS = {
  upcoming: "faith.team.upcoming.layout",
  announcements: "faith.team.announcements.layout",
  records: "faith.team.records.layout",
} as const;

function readSectionLayout(key: string): SectionLayout {
  if (typeof window === "undefined") return "list";
  try {
    const saved = window.localStorage.getItem(key);
    return saved === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function writeSectionLayout(key: string, layout: SectionLayout) {
  try {
    window.localStorage.setItem(key, layout);
  } catch {
    /* ignore */
  }
}

function SectionLayoutToggle({
  value,
  label,
  onChange,
}: {
  value: SectionLayout;
  label: string;
  onChange: (next: SectionLayout) => void;
}) {
  // M3/세그먼트 관행: 세그먼트 간 공백 없이 연결, 활성은 트랙 대비가 분명한 fill
  return (
    <div
      className="flex shrink-0 overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border"
      role="group"
      aria-label={`${label} 레이아웃`}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 rounded-none cursor-pointer text-muted-2 hover:bg-transparent hover:text-foreground",
          value === "list" && "bg-card text-foreground shadow-soft",
        )}
        aria-pressed={value === "list"}
        aria-label="목록 보기"
        onClick={() => onChange("list")}
      >
        <List className="h-4 w-4" strokeWidth={1.75} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "h-8 w-8 rounded-none cursor-pointer text-muted-2 hover:bg-transparent hover:text-foreground",
          value === "grid" && "bg-card text-foreground shadow-soft",
        )}
        aria-pressed={value === "grid"}
        aria-label="격자 보기"
        onClick={() => onChange("grid")}
      >
        <LayoutGrid className="h-4 w-4" strokeWidth={1.75} />
      </Button>
    </div>
  );
}

function sectionGridClass(
  count: number,
  options?: { split?: boolean },
) {
  if (options?.split) {
    // 반폭 컬럼: 모바일(스택 시) 1열 → sm 2열 → md(나란히) 1열 → xl 2열
    return "grid grid-cols-1 gap-3 bg-card px-3 pb-3 pt-2 sm:grid-cols-2 sm:px-4 sm:pb-4 sm:pt-3 md:grid-cols-1 xl:grid-cols-2";
  }
  return cn(
    // 전체 폭: 모바일 1열, 태블릿+ 2열, 항목 많으면 xl 3열
    "grid grid-cols-1 gap-3 bg-card px-3 pb-3 pt-2 sm:grid-cols-2 sm:gap-3 sm:px-4 sm:pb-4 sm:pt-3",
    count >= 5 && "xl:grid-cols-3",
  );
}

type WorkspacePayload = {
  serverNow: string;
  team: {
    id: string;
    name: string;
    ownerId: string;
    seatLimit: number;
    policy: {
      announcementHideAfterRead: boolean;
      forceMicrophoneOff: boolean;
      preHostRecordingDefault: boolean;
      preHostRecordingLocked: boolean;
      retentionDays: number;
      allowAdminUnmask: boolean;
      allowExternalSharing: boolean;
    } | null;
  };
  currentMember: {
    userId: string;
    role: PreviewRole;
    canCreateMeeting: boolean;
  };
  unconfirmedAlerts: Array<{
    notificationId: string;
    meetingId: string | null;
    title: string;
    body: string;
  }>;
  nearest: UpcomingCard | null;
  upcoming: UpcomingCard[];
  announcements: Array<{
    id: string;
    title: string;
    body: string;
    pinned: boolean;
    read: boolean;
    createdAt: string;
  }>;
  recentRecords: Array<{
    id: string;
    title: string;
    endedAt: string | null;
    state: string;
  }>;
  members?: ParticipantOption[];
  capabilities: {
    manageTeam: boolean;
    createMeeting: boolean;
    viewAudit: boolean;
    isOwner: boolean;
    isLeader: boolean;
    isPlatformAdmin?: boolean;
  };
  auditCount: number;
};

type UpcomingCard = {
  id: string;
  title: string;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  organizer: { id: string; name: string | null; handle: string | null };
  invitedCount: number;
  status: string;
  canJoin: boolean;
  acknowledged: boolean;
  acknowledgementStats: { invited: number; acknowledged: number };
};

const PREVIEW_LABEL = TEAM_PREVIEW_ROLE_LABEL;

const CTA_CLASS =
  "group flex h-24 w-full origin-center cursor-pointer items-center gap-4 rounded-2xl px-6 text-left shadow-soft transition-[transform,box-shadow,background-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:scale-[1.008] motion-reduce:transition-colors motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:scale-100";

function todayDateLabel() {
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  const weekdayLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "long",
  }).format(now);
  return `${dateLabel} ${weekdayLabel}`;
}

function formatRecordWhen(endedAt: string | null) {
  if (!endedAt) return "-";
  return new Date(endedAt).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function recordStateLabel(state: string) {
  switch (state) {
    case "READY":
      return "완료";
    case "PROCESSING":
      return "처리 중";
    case "FAILED":
      return "실패";
    case "ENDED":
      return "종료";
    case "ACTIVE":
      return "진행";
    default:
      return state;
  }
}

function SectionCard({
  title,
  icon,
  count,
  action,
  toolbar,
  children,
  empty,
  className,
}: {
  title: string;
  /** 타이틀 왼쪽, 바로 붙는 장식 아이콘 */
  icon?: ReactNode;
  count?: number;
  /** 카운트 오른쪽 액션 (예: 추가) */
  action?: ReactNode;
  toolbar?: ReactNode;
  children?: ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "panel-surface flex h-full min-h-0 flex-col overflow-hidden rounded-2xl outline-none",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border/70 bg-card px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-1.5">
          {icon ? (
            <span className="inline-flex shrink-0 text-foreground/70">
              {icon}
            </span>
          ) : null}
          <div className="flex min-w-0 items-center gap-2.5">
            {typeof count === "number" && count > 0 ? (
              <span className="text-base font-semibold tabular-nums text-muted">
                {count}
              </span>
            ) : null}
            <h2 className="text-xl font-semibold text-foreground">{title}</h2>
            {action}
          </div>
        </div>
        {toolbar ? (
          <div className="flex shrink-0 items-center gap-1.5">{toolbar}</div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 bg-card">{empty ?? children}</div>
    </section>
  );
}

function SectionEmpty({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="px-4 pb-8 pt-1 text-center sm:px-5">
      <p className="text-base text-muted">{message}</p>
      {actionLabel && onAction ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-4 min-h-11 rounded-xl"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function TeamWorkspaceEmpty() {
  const features = [
    "팀원, 팀장, 팀 대표 역할과 세부 권한 분리",
    "온라인 음성 회의와 기록 상태 공유",
    "예정 회의, 참가, 일정 알림 연동",
    "회의별 기록 열람 권한 관리",
    "팀 공지와 확인 상태 관리",
    "중요 변경과 접근 감사 로그",
    "팀 보존 기간과 보안 정책 설정",
  ] as const;

  return (
    <section className="mx-auto w-full max-w-5xl py-8 sm:py-12">
      <header className="mx-auto max-w-2xl text-center">
        <p className="text-xl font-semibold text-primary">Team</p>
        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
          팀을 위한 안전한 회의 워크스페이스
        </h1>
        <p className="mt-4 text-base leading-7 text-muted sm:text-lg">
          회의부터 기록 접근까지, 팀 단위로 안정적으로 운영하세요.
        </p>
      </header>

      <article className="mx-auto mt-8 max-w-3xl rounded-[28px] bg-card p-6 shadow-soft sm:mt-10 sm:p-8">
        <div className="grid gap-8 md:grid-cols-[minmax(0,0.8fr)_minmax(18rem,1.2fr)] md:gap-10">
          <div className="flex flex-col">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Team
              </h2>
              <p className="mt-2 text-base leading-6 text-muted">
                팀 회의와 기록 운영에 필요한 관리 기능을 제공합니다.
              </p>

              <p className="mt-8 text-3xl font-bold tracking-tight text-foreground">
                팀 플랜
              </p>
              <p className="mt-1 text-sm text-muted">
                2명부터 바로 구성할 수 있습니다.
              </p>
            </div>

            <Link
              href="/pricing"
              className="group mt-8 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              팀 플랜 보기
              <ArrowUpRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
                aria-hidden
              />
            </Link>
          </div>

          <div className="border-t border-border pt-7 md:border-l md:border-t-0 md:pl-10 md:pt-0">
            <h3 className="text-base font-semibold text-foreground">
              다음 기능 포함
            </h3>
            <ul className="mt-5 space-y-3.5">
              {features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2.5 text-base text-foreground"
                >
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    strokeWidth={2.5}
                    aria-hidden
                  />
                  <span className="leading-6">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </article>
    </section>
  );
}

export function TeamWorkspacePanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeTeamId, setActiveTeamId } = useAppContext();
  const { scenarioId, isLive } = usePageUxPreview();
  const {
    enabled: rolePreviewEnabled,
    previewRole,
    resolveRole,
    isPreviewing,
  } = useTeamRolePreview();
  const [teams, setTeams] = useState<Array<{ id: string; name: string }>>([]);
  const [data, setData] = useState<WorkspacePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceBody, setAnnounceBody] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerIntent, setComposerIntent] = useState<"start" | "schedule">(
    "start",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [composerSaving, setComposerSaving] = useState(false);
  const [composerMessage, setComposerMessage] = useState("");
  const [composerMembers, setComposerMembers] = useState<ParticipantOption[]>(
    [],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [upcomingLayout, setUpcomingLayout] = useState<SectionLayout>("list");
  const [announcementsLayout, setAnnouncementsLayout] =
    useState<SectionLayout>("list");
  const [recordsLayout, setRecordsLayout] = useState<SectionLayout>("list");
  const activeTeamIdRef = useRef(activeTeamId);
  activeTeamIdRef.current = activeTeamId;
  const hasDataRef = useRef(false);

  useEffect(() => {
    queueMicrotask(() => {
      setUpcomingLayout(readSectionLayout(TEAM_SECTION_LAYOUT_KEYS.upcoming));
      setAnnouncementsLayout(
        readSectionLayout(TEAM_SECTION_LAYOUT_KEYS.announcements),
      );
      setRecordsLayout(readSectionLayout(TEAM_SECTION_LAYOUT_KEYS.records));
    });
  }, []);

  const setUpcomingLayoutPersist = useCallback((next: SectionLayout) => {
    setUpcomingLayout(next);
    writeSectionLayout(TEAM_SECTION_LAYOUT_KEYS.upcoming, next);
  }, []);
  const setAnnouncementsLayoutPersist = useCallback((next: SectionLayout) => {
    setAnnouncementsLayout(next);
    writeSectionLayout(TEAM_SECTION_LAYOUT_KEYS.announcements, next);
  }, []);
  const setRecordsLayoutPersist = useCallback((next: SectionLayout) => {
    setRecordsLayout(next);
    writeSectionLayout(TEAM_SECTION_LAYOUT_KEYS.records, next);
  }, []);

  const loadTeams = useCallback(async () => {
    try {
      const response = await clientGet("/api/teams");
      const json = (await response.json()) as {
        ok?: boolean;
        teams?: Array<{ id: string; name: string }>;
      };
      if (!response.ok || !json.ok) {
        setTeams([]);
        setActiveTeamId(null);
        setData(null);
        hasDataRef.current = false;
        setLoading(false);
        return;
      }
      const next = json.teams ?? [];
      setTeams(next);
      if (!next.some((team) => team.id === activeTeamIdRef.current)) {
        setActiveTeamId(next[0]?.id ?? null);
        if (next.length === 0) {
          setData(null);
          hasDataRef.current = false;
          setLoading(false);
        }
      }
    } catch {
      setTeams([]);
      setActiveTeamId(null);
      setData(null);
      hasDataRef.current = false;
      setLoading(false);
    }
  }, [setActiveTeamId]);

  const loadWorkspace = useCallback(
    async (teamId: string, options?: { soft?: boolean }) => {
      const soft = Boolean(options?.soft && hasDataRef.current);
      if (!soft) {
        setLoading(true);
        setMessage("");
      }
      try {
        const response = await clientGet(`/api/teams/${teamId}/workspace`);
        if (activeTeamIdRef.current !== teamId) return;
        const json = (await response.json()) as WorkspacePayload & {
          ok?: boolean;
          message?: string;
        };
        if (response.ok && json.ok) {
          setData(json);
          hasDataRef.current = true;
          setRenameValue(json.team.name);
          if (!soft) setMessage("");
        } else {
          setData(null);
          hasDataRef.current = false;
          if (response.status === 401 || response.status === 403) {
            setActiveTeamId(null);
          } else if (response.status !== 404 && !soft) {
            setMessage(json.message ?? "팀 공간을 불러오지 못했습니다.");
          }
        }
      } catch {
        if (activeTeamIdRef.current !== teamId) return;
        if (!soft) {
          setData(null);
          hasDataRef.current = false;
          setMessage("팀 공간을 불러오지 못했습니다.");
        }
      } finally {
        if (activeTeamIdRef.current === teamId && !soft) {
          setLoading(false);
        }
      }
    },
    [setActiveTeamId],
  );

  useEffect(() => {
    queueMicrotask(() => void loadTeams());
  }, [loadTeams]);

  useEffect(() => {
    if (!activeTeamId) {
      queueMicrotask(() => {
        setData(null);
        hasDataRef.current = false;
        setLoading(false);
      });
      return;
    }
    hasDataRef.current = false;
    queueMicrotask(() => void loadWorkspace(activeTeamId));
    const timer = window.setInterval(() => {
      void loadWorkspace(activeTeamId, { soft: true });
    }, 45_000);
    return () => window.clearInterval(timer);
  }, [activeTeamId, loadWorkspace]);

  useEffect(() => {
    const onFocus = () => {
      if (activeTeamId) void loadWorkspace(activeTeamId, { soft: true });
    };
    const onNotif = () => {
      if (activeTeamId) {
        invalidateClientFetch(`/api/teams/${activeTeamId}/workspace`);
        void loadWorkspace(activeTeamId, { soft: true });
      }
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("faith:notifications-changed", onNotif);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("faith:notifications-changed", onNotif);
    };
  }, [activeTeamId, loadWorkspace]);

  const refreshWorkspace = useCallback(
    async (teamId: string) => {
      invalidateClientFetch(`/api/teams/${teamId}`);
      invalidateClientFetch("/api/teams");
      await loadWorkspace(teamId);
    },
    [loadWorkspace],
  );

  const actualRole = data?.currentMember.role ?? "MEMBER";
  const viewRole = resolveRole(actualRole);
  const caps = useMemo(() => {
    const real = data?.capabilities;
    if (!real) {
      return {
        showLeader: false,
        showOwner: false,
        canActLeader: false,
        canActOwner: false,
      };
    }
    return {
      showLeader: viewRole === "ADMIN" || viewRole === "OWNER",
      showOwner: viewRole === "OWNER",
      canActLeader: real.isLeader,
      canActOwner: real.isOwner,
    };
  }, [data?.capabilities, viewRole]);

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase("ko-KR");
  const displayData = useMemo(() => {
    if (!data) return null;
    if (scenarioId === "live") return data;
    if (scenarioId === "empty") {
      return {
        ...data,
        nearest: null,
        upcoming: [],
        announcements: [],
        recentRecords: [],
        unconfirmedAlerts: [],
      };
    }
    if (scenarioId === "full" || scenarioId === "banner-alerts") {
      const baseStart = Date.now() + 3600_000;
      const upcoming = Array.from({ length: 8 }, (_, index) => ({
        id: `ux-up-${index + 1}`,
        title: `팀 회의 ${index + 1}`,
        scheduledStartAt: new Date(baseStart + index * 86400000).toISOString(),
        scheduledEndAt: new Date(
          baseStart + index * 86400000 + 3600_000,
        ).toISOString(),
        organizer: {
          id: data.currentMember.userId,
          name: "주최자",
          handle: null,
        },
        invitedCount: 4 + (index % 3),
        status: "SCHEDULED",
        canJoin: true,
        acknowledged: index % 2 === 0,
        acknowledgementStats: {
          invited: 4 + (index % 3),
          acknowledged: 1 + (index % 3),
        },
      }));
      const announcements = Array.from({ length: 6 }, (_, index) => ({
        id: `ux-an-${index + 1}`,
        title: `공지 ${index + 1}`,
        body: "팀 운영과 일정에 관한 안내입니다.",
        pinned: index === 0,
        read: index > 1,
        createdAt: new Date(Date.now() - index * 86400000).toISOString(),
      }));
      const recentRecords = Array.from({ length: 10 }, (_, index) => ({
        id: `ux-rec-${index + 1}`,
        title: `최근 기록 ${index + 1}`,
        endedAt: new Date(Date.now() - index * 7200000).toISOString(),
        state: "COMPLETED",
      }));
      const unconfirmedAlerts = [
        {
          notificationId: "ux-alert-1",
          meetingId: upcoming[0]?.id ?? null,
          title: "회의 일정이 변경되었습니다",
          body: "주간 싱크 시작 시각이 변경되었습니다.",
        },
        {
          notificationId: "ux-alert-2",
          meetingId: upcoming[1]?.id ?? null,
          title: "참석 확인이 필요합니다",
          body: "내일 회의 참석을 확인해 주세요.",
        },
      ];
      return {
        ...data,
        nearest: upcoming[0] ?? null,
        upcoming,
        announcements,
        recentRecords,
        unconfirmedAlerts:
          scenarioId === "banner-alerts" || scenarioId === "full"
            ? unconfirmedAlerts
            : data.unconfirmedAlerts,
      };
    }
    return data;
  }, [data, scenarioId]);

  const filteredUpcoming = useMemo(
    () =>
      !normalizedSearch
        ? (displayData?.upcoming ?? [])
        : (displayData?.upcoming ?? []).filter((meeting) =>
            `${meeting.title} ${meeting.organizer.name ?? ""} ${meeting.organizer.handle ?? ""}`
              .toLocaleLowerCase("ko-KR")
              .includes(normalizedSearch),
          ),
    [displayData?.upcoming, normalizedSearch],
  );
  const filteredRecords = useMemo(
    () =>
      !normalizedSearch
        ? (displayData?.recentRecords ?? [])
        : (displayData?.recentRecords ?? []).filter((record) =>
            record.title.toLocaleLowerCase("ko-KR").includes(normalizedSearch),
          ),
    [displayData?.recentRecords, normalizedSearch],
  );
  const nearestId = displayData?.nearest?.id ?? null;
  const dateHeading = todayDateLabel();

  const openAnnouncementSheet = useCallback(() => {
    router.push("/team?manage=announcements");
  }, [router]);

  const manageView = searchParams.get("manage");
  const allowedManage =
    manageView === "members" || manageView === "security"
      ? actualRole === "OWNER"
      : manageView === "records" ||
          manageView === "invite" ||
          manageView === "announcements"
        ? actualRole === "OWNER" || actualRole === "ADMIN"
        : false;
  const managementPageOpen =
    allowedManage &&
    (manageView === "members" ||
      manageView === "security" ||
      manageView === "records" ||
      manageView === "invite");
  const announcementSheetOpen =
    (allowedManage && manageView === "announcements") ||
    scenarioId === "popup-announce";

  useEffect(() => {
    if (scenarioId === "popup-composer") {
      setComposerIntent("start");
      setComposerOpen(true);
      setSettingsOpen(false);
      return;
    }
    if (scenarioId === "popup-composer-schedule") {
      setComposerIntent("schedule");
      setComposerOpen(true);
      setSettingsOpen(false);
      return;
    }
    if (scenarioId === "popup-settings") {
      setSettingsOpen(true);
      setComposerOpen(false);
      return;
    }
    if (scenarioId === "popup-announce") {
      setComposerOpen(false);
      setSettingsOpen(false);
      if (manageView !== "announcements") {
        router.replace("/team?manage=announcements");
      }
      return;
    }
    if (
      scenarioId === "live" ||
      scenarioId === "empty" ||
      scenarioId === "full" ||
      scenarioId === "loading" ||
      scenarioId === "banner-alerts" ||
      scenarioId === "popup-notifications" ||
      scenarioId === "popup-notifications-empty" ||
      scenarioId === "popup-notifications-loading" ||
      scenarioId === "popup-account"
    ) {
      setComposerOpen(false);
      setSettingsOpen(false);
    }
  }, [manageView, router, scenarioId]);

  useEffect(() => {
    if (!data || !manageView) return;
    if (!allowedManage) {
      router.replace("/team");
    }
  }, [allowedManage, data, manageView, router]);

  useEffect(() => {
    if (!composerOpen || !data?.team.id) return;
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/teams/${data.team.id}`, {
        cache: "no-store",
      });
      const json = (await response.json()) as {
        members?: ParticipantOption[];
        currentMember?: { userId: string };
      };
      if (cancelled) return;
      setComposerMembers(
        (json.members ?? []).filter(
          (member) => member.userId !== json.currentMember?.userId,
        ),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [composerOpen, data?.team.id]);

  async function softSavePause() {
    await new Promise((resolve) => window.setTimeout(resolve, 400));
  }

  async function confirmAlert(
    notificationId: string,
    meetingId: string | null,
  ) {
    setSaving(true);
    if (!isLive) {
      await softSavePause();
      setSaving(false);
      return;
    }
    const response = await fetch("/api/notifications/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationId,
        meetingId: meetingId ?? undefined,
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setMessage("확인에 실패했습니다.");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("faith:notifications-changed", { detail: {} }),
    );
    if (activeTeamId) await refreshWorkspace(activeTeamId);
  }

  async function renameTeam() {
    if (!data || !caps.canActOwner || !renameValue.trim()) return;
    setSaving(true);
    if (!isLive) {
      await softSavePause();
      setSaving(false);
      setRenaming(false);
      return;
    }
    const response = await fetch(`/api/teams/${data.team.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: renameValue }),
    });
    setSaving(false);
    if (!response.ok) {
      setMessage("팀 이름을 바꾸지 못했습니다.");
      return;
    }
    setRenaming(false);
    invalidateClientFetch("/api/teams");
    await loadTeams();
    await refreshWorkspace(data.team.id);
  }

  async function createAnnouncement() {
    if (!data || !caps.canActLeader) return;
    setSaving(true);
    if (!isLive) {
      await softSavePause();
      setSaving(false);
      setAnnounceTitle("");
      setAnnounceBody("");
      return;
    }
    const response = await fetch(`/api/teams/${data.team.id}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: announceTitle,
        body: announceBody,
        pinned: true,
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setMessage("공지를 만들지 못했습니다.");
      return;
    }
    setAnnounceTitle("");
    setAnnounceBody("");
    await refreshWorkspace(data.team.id);
  }

  async function archiveAnnouncement(id: string) {
    if (!data || !caps.canActLeader) return;
    setSaving(true);
    if (!isLive) {
      await softSavePause();
      setSaving(false);
      return;
    }
    const response = await fetch(
      `/api/teams/${data.team.id}/announcements/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archive: true }),
      },
    );
    setSaving(false);
    if (!response.ok) {
      setMessage("공지를 보관하지 못했습니다.");
      return;
    }
    await refreshWorkspace(data.team.id);
  }

  async function toggleAnnouncementPin(id: string, pinned: boolean) {
    if (!data || !caps.canActLeader) return;
    setSaving(true);
    if (!isLive) {
      await softSavePause();
      setSaving(false);
      return;
    }
    const response = await fetch(
      `/api/teams/${data.team.id}/announcements/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !pinned }),
      },
    );
    setSaving(false);
    if (!response.ok) {
      setMessage("공지 고정을 바꾸지 못했습니다.");
      return;
    }
    await refreshWorkspace(data.team.id);
  }

  async function markAnnouncementRead(id: string) {
    if (!data) return;
    if (!isLive) return;
    await fetch(`/api/teams/${data.team.id}/announcements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmRead: true }),
    });
    await refreshWorkspace(data.team.id);
  }

  async function updatePolicy(patch: Record<string, unknown>) {
    if (!data || !caps.canActOwner) return;
    setSaving(true);
    if (!isLive) {
      await softSavePause();
      setSaving(false);
      return;
    }
    const response = await fetch(`/api/teams/${data.team.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSaving(false);
    if (!response.ok) {
      setMessage("설정을 저장하지 못했습니다.");
      return;
    }
    await refreshWorkspace(data.team.id);
  }

  async function submitComposer(values: TeamMeetingComposerValues) {
    if (!data || !caps.canActLeader) return;
    if (!values.title.trim()) {
      setComposerMessage("제목을 확인해 주세요.");
      return;
    }
    if (values.intent === "schedule" && !values.start) {
      setComposerMessage("시작 시각을 확인해 주세요.");
      return;
    }
    setComposerSaving(true);
    setComposerMessage("");
    if (!isLive) {
      await softSavePause();
      setComposerSaving(false);
      setComposerOpen(false);
      return;
    }
    const response = await fetch("/api/team-meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: data.team.id,
        title: values.title,
        mode: "ONLINE",
        startNow: values.intent === "start",
        scheduledStartAt:
          values.intent === "schedule"
            ? new Date(values.start).toISOString()
            : new Date().toISOString(),
        durationMinutes: values.durationMinutes,
        participantIds: values.participantIds,
        backupHostId: values.backupHostId || null,
      }),
    });
    const json = (await response.json()) as {
      ok?: boolean;
      href?: string;
      message?: string;
    };
    setComposerSaving(false);
    if (!response.ok || !json.ok) {
      setComposerMessage(json.message ?? "회의를 만들지 못했습니다.");
      return;
    }
    setComposerOpen(false);
    if (json.href && values.intent === "start") {
      window.location.assign(json.href);
      return;
    }
    await refreshWorkspace(data.team.id);
  }

  async function cancelUpcomingMeeting(meetingId: string) {
    if (!confirm("일정을 취소할까요?")) return;
    setSaving(true);
    if (!isLive) {
      await softSavePause();
      setSaving(false);
      return;
    }
    await fetch(`/api/team-meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    });
    setSaving(false);
    if (activeTeamId) await refreshWorkspace(activeTeamId);
  }

  if ((loading && !data) || scenarioId === "loading") {
    return (
      <div className="grid min-h-56 place-items-center rounded-2xl bg-card shadow-soft">
        <LoaderCircle
          className="h-6 w-6 animate-spin text-muted"
          aria-label="불러오는 중"
        />
      </div>
    );
  }

  if (!activeTeamId || !data) {
    return <TeamWorkspaceEmpty />;
  }

  if (managementPageOpen) {
    const manageTitle =
      manageView === "security"
        ? "보안 정책"
        : manageView === "records"
          ? "기록 열람"
          : manageView === "invite"
            ? "멤버 초대"
            : "구성원과 권한";

    return (
      <div className="space-y-6">
        <header className="min-w-0">
          <Link
            href="/team"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-1 text-base text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
            팀 공간
          </Link>
          <h1 className="mt-2 text-2xl font-bold leading-none tracking-tight text-foreground">
            {manageTitle}
          </h1>
        </header>
        <TeamManagePanel
          view={
            manageView === "security" ||
            manageView === "records" ||
            manageView === "invite"
              ? manageView
              : "members"
          }
        />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-4">
      {message ? (
        <div className="rounded-2xl bg-primary-soft px-4 py-3 text-base">
          {message}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-base font-medium leading-none text-muted">
            {dateHeading}
          </p>
          {renaming && caps.canActOwner ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                className="min-h-12 max-w-xs text-lg font-semibold"
                maxLength={50}
                aria-label="팀 이름"
              />
              <Button
                className="min-h-12"
                disabled={saving}
                onClick={() => void renameTeam()}
              >
                저장
              </Button>
              <Button
                variant="ghost"
                className="min-h-12"
                onClick={() => {
                  setRenaming(false);
                  setRenameValue(data.team.name);
                }}
              >
                취소
              </Button>
            </div>
          ) : (
            <div className="mt-2 flex min-w-0 items-center gap-1">
              <h1 className="truncate text-2xl font-bold leading-none tracking-tight text-foreground">
                {data.team.name}
              </h1>
              {caps.showOwner && caps.canActOwner ? (
                <button
                  type="button"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground"
                  onClick={() => setRenaming(true)}
                  aria-label="팀 이름 바꾸기"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              ) : null}
              {caps.showOwner ? (
                <Button
                  variant="ghost"
                  className="ml-0.5 h-10 shrink-0 gap-1.5 px-2.5 text-base"
                  disabled={!caps.canActOwner}
                  onClick={() => setSettingsOpen(true)}
                >
                  <Settings className="h-4 w-4" />
                  팀 설정
                </Button>
              ) : null}
            </div>
          )}
          {rolePreviewEnabled && isPreviewing && previewRole ? (
            <p className="mt-2 text-base text-muted">
              {PREVIEW_LABEL[previewRole]} 화면 미리보기
            </p>
          ) : null}
          {teams.length > 1 ? (
            <label className="mt-3 block max-w-xs">
              <span className="sr-only">팀 선택</span>
              <select
                value={activeTeamId}
                onChange={(event) => setActiveTeamId(event.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-base outline-none focus:ring-2 focus:ring-ring"
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="w-full min-w-0 sm:max-w-sm sm:flex-1">
          <MeetingSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="회의, 참석자 검색"
            className="bg-card"
          />
        </div>
      </div>

      {caps.showLeader ? (
        <section className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0 p-0.5">
              <button
                type="button"
                disabled={!caps.canActLeader}
                onClick={() => {
                  setComposerIntent("start");
                  setComposerMessage("");
                  setComposerMembers([]);
                  setComposerOpen(true);
                }}
                className={cn(
                  CTA_CLASS,
                  "bg-primary text-primary-foreground hover:bg-primary-hover hover:shadow-[0_10px_28px_rgba(17,24,46,0.14)]",
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-primary transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 motion-reduce:group-hover:scale-100">
                  <Mic className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="text-lg font-semibold tracking-tight">
                  회의 시작
                </span>
              </button>
            </div>
            <div className="min-w-0 p-0.5">
              <button
                type="button"
                disabled={!caps.canActLeader}
                onClick={() => {
                  setComposerIntent("schedule");
                  setComposerMessage("");
                  setComposerMembers([]);
                  setComposerOpen(true);
                }}
                className={cn(
                  CTA_CLASS,
                  "bg-card text-foreground ring-1 ring-border hover:bg-surface hover:shadow-[0_10px_28px_rgba(17,24,46,0.1)]",
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 motion-reduce:group-hover:scale-100">
                  <CalendarDays className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="text-lg font-semibold tracking-tight">
                  일정 잡기
                </span>
              </button>
            </div>
            <div className="min-w-0 p-0.5">
              <button
                type="button"
                disabled={!caps.canActLeader}
                onClick={openAnnouncementSheet}
                className={cn(
                  CTA_CLASS,
                  "bg-card text-foreground ring-1 ring-border hover:bg-surface hover:shadow-[0_10px_28px_rgba(17,24,46,0.1)]",
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-105 motion-reduce:group-hover:scale-100">
                  <Megaphone className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="text-lg font-semibold tracking-tight">
                  공지 생성
                </span>
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {displayData!.unconfirmedAlerts.length > 0 ? (
        <section className="space-y-2">
          {displayData!.unconfirmedAlerts.map((alert) => (
            <div
              key={alert.notificationId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary-soft/80 px-4 py-3.5"
            >
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-foreground">
                  {alert.title}
                </p>
                <p className="mt-0.5 text-base text-muted">{alert.body}</p>
              </div>
              <Button
                className="min-h-11 rounded-xl"
                disabled={saving}
                onClick={() =>
                  void confirmAlert(alert.notificationId, alert.meetingId)
                }
              >
                확인
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
        <SectionCard
          title="예정 회의"
          count={filteredUpcoming.length}
          action={
            caps.showLeader && caps.canActLeader ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 cursor-pointer text-foreground/70 hover:bg-surface hover:text-foreground"
                aria-label="일정 잡기"
                onClick={() => {
                  setComposerIntent("schedule");
                  setComposerMessage("");
                  setComposerMembers([]);
                  setComposerOpen(true);
                }}
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            ) : null
          }
          toolbar={
            filteredUpcoming.length > 0 ? (
              <SectionLayoutToggle
                value={upcomingLayout}
                label="예정 회의"
                onChange={setUpcomingLayoutPersist}
              />
            ) : null
          }
          empty={
            filteredUpcoming.length === 0 ? (
              <SectionEmpty
                message={
                  normalizedSearch
                    ? "검색된 예정 회의가 없습니다."
                    : "예정된 회의가 없습니다."
                }
                actionLabel={
                  !normalizedSearch && caps.showLeader && caps.canActLeader
                    ? "일정 잡기"
                    : undefined
                }
                onAction={
                  !normalizedSearch && caps.showLeader && caps.canActLeader
                    ? () => {
                        setComposerIntent("schedule");
                        setComposerMessage("");
                        setComposerMembers([]);
                        setComposerOpen(true);
                      }
                    : undefined
                }
              />
            ) : undefined
          }
        >
          {filteredUpcoming.length > 0 ? (
            upcomingLayout === "list" ? (
              <ul className="divide-y divide-border/70">
                {filteredUpcoming.map((meeting) => (
                  <li key={meeting.id}>
                    <UpcomingMeetingRow
                      meeting={meeting}
                      emphasized={meeting.id === nearestId}
                      showAck={caps.showLeader}
                      trailing={
                        caps.showLeader && caps.canActLeader ? (
                          <Button
                            variant="ghost"
                            className="min-h-11 rounded-xl text-muted hover:text-foreground"
                            onClick={() =>
                              void cancelUpcomingMeeting(meeting.id)
                            }
                          >
                            취소
                          </Button>
                        ) : null
                      }
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <ul
                className={sectionGridClass(filteredUpcoming.length, {
                  split: true,
                })}
              >
                {filteredUpcoming.map((meeting) => (
                  <li key={meeting.id} className="min-h-0">
                    <UpcomingMeetingGridCard
                      meeting={meeting}
                      emphasized={meeting.id === nearestId}
                      showAck={caps.showLeader}
                      trailing={
                        caps.showLeader && caps.canActLeader ? (
                          <Button
                            variant="ghost"
                            className="min-h-11 rounded-xl text-muted hover:text-foreground"
                            onClick={() =>
                              void cancelUpcomingMeeting(meeting.id)
                            }
                          >
                            취소
                          </Button>
                        ) : null
                      }
                    />
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </SectionCard>

        <SectionCard
          title="팀 공지"
          count={displayData!.announcements.length}
          action={
            caps.showLeader && caps.canActLeader ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 cursor-pointer text-foreground/70 hover:bg-surface hover:text-foreground"
                aria-label="공지 생성"
                onClick={openAnnouncementSheet}
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            ) : null
          }
          toolbar={
            displayData!.announcements.length > 0 ? (
              <SectionLayoutToggle
                value={announcementsLayout}
                label="팀 공지"
                onChange={setAnnouncementsLayoutPersist}
              />
            ) : null
          }
          empty={
            displayData!.announcements.length === 0 ? (
              <SectionEmpty
                message="등록된 공지가 없습니다."
                actionLabel={
                  caps.showLeader && caps.canActLeader
                    ? "공지 생성"
                    : undefined
                }
                onAction={
                  caps.showLeader && caps.canActLeader
                    ? openAnnouncementSheet
                    : undefined
                }
              />
            ) : undefined
          }
        >
          {displayData!.announcements.length > 0 ? (
            announcementsLayout === "list" ? (
              <ul className="divide-y divide-border/70">
                {displayData!.announcements.slice(0, 5).map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:px-5"
                  >
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "text-lg font-semibold",
                          item.read ? "text-muted" : "text-foreground",
                        )}
                      >
                        {item.pinned ? "고정, " : ""}
                        {item.title}
                      </p>
                      <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-base text-muted">
                        {item.body}
                      </p>
                    </div>
                    {!item.read ? (
                      <Button
                        variant="ghost"
                        className="min-h-11 w-full shrink-0 rounded-xl sm:w-auto"
                        onClick={() => void markAnnouncementRead(item.id)}
                      >
                        확인
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <ul
                className={sectionGridClass(displayData!.announcements.length, {
                  split: true,
                })}
              >
                {displayData!.announcements.slice(0, 5).map((item) => (
                  <li key={item.id} className="min-h-0">
                    <div
                      className={cn(
                        "flex h-full min-h-[9.5rem] flex-col rounded-xl bg-card p-4 sm:min-h-[10.5rem]",
                        item.read
                          ? "border border-border"
                          : "border-2 border-primary/40 shadow-soft",
                      )}
                    >
                      <p
                        className={cn(
                          "line-clamp-2 text-lg font-semibold",
                          item.read ? "text-muted" : "text-foreground",
                        )}
                      >
                        {item.pinned ? "고정, " : ""}
                        {item.title}
                      </p>
                      <p className="mt-2 line-clamp-3 flex-1 whitespace-pre-wrap text-base text-muted">
                        {item.body}
                      </p>
                      {!item.read ? (
                        <Button
                          variant="secondary"
                          className="mt-4 min-h-11 w-full rounded-xl"
                          onClick={() => void markAnnouncementRead(item.id)}
                        >
                          확인
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </SectionCard>
      </div>

      <SectionCard
        title="최근 기록"
        count={filteredRecords.length}
        toolbar={
          filteredRecords.length > 0 ? (
            <SectionLayoutToggle
              value={recordsLayout}
              label="최근 기록"
              onChange={setRecordsLayoutPersist}
            />
          ) : null
        }
        empty={
          filteredRecords.length === 0 ? (
            <SectionEmpty
              message={
                normalizedSearch
                  ? "검색된 기록이 없습니다."
                  : "열람 가능한 기록이 없습니다."
              }
            />
          ) : undefined
        }
      >
        {filteredRecords.length > 0 ? (
          recordsLayout === "list" ? (
            <ul className="divide-y divide-border/70">
              {filteredRecords.map((record) => (
                <li key={record.id}>
                  <Link
                    href={`/meetings/team/${record.id}`}
                    className="grid min-h-14 items-start gap-2 px-4 py-3.5 transition-colors hover:bg-surface/70 sm:grid-cols-[minmax(7rem,auto)_1fr_auto] sm:items-center sm:gap-3 sm:px-5"
                  >
                    <span className="text-base font-semibold tabular-nums tracking-tight text-muted sm:text-lg sm:text-foreground">
                      {formatRecordWhen(record.endedAt)}
                    </span>
                    <span className="truncate text-lg font-semibold text-foreground">
                      {record.title}
                    </span>
                    <span className="text-base text-muted">
                      {recordStateLabel(record.state)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <ul className={sectionGridClass(filteredRecords.length)}>
              {filteredRecords.map((record) => (
                <li key={record.id} className="min-h-0">
                  <Link
                    href={`/meetings/team/${record.id}`}
                    className="flex h-full min-h-[8.5rem] flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-border-strong hover:bg-surface/50 sm:min-h-[9.5rem]"
                  >
                    <span className="text-base font-semibold tabular-nums text-muted">
                      {formatRecordWhen(record.endedAt)}
                    </span>
                    <span className="mt-2 line-clamp-2 flex-1 text-lg font-semibold leading-snug text-foreground">
                      {record.title}
                    </span>
                    <span className="mt-3 text-base text-muted">
                      {recordStateLabel(record.state)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </SectionCard>

      <TeamSheet
        open={
          composerOpen ||
          scenarioId === "popup-composer" ||
          scenarioId === "popup-composer-schedule"
        }
        title="팀 회의"
        onClose={() => {
          if (
            scenarioId === "popup-composer" ||
            scenarioId === "popup-composer-schedule"
          ) {
            return;
          }
          setComposerOpen(false);
        }}
        footer={null}
      >
        <TeamMeetingComposer
          key={`${composerIntent}-${composerOpen}-${scenarioId}`}
          members={composerMembers}
          initialIntent={composerIntent}
          saving={composerSaving}
          message={composerMessage}
          compact
          onSubmit={submitComposer}
        />
      </TeamSheet>

      <TeamSheet
        open={announcementSheetOpen}
        title="팀 관리"
        onClose={() => {
          if (scenarioId === "popup-announce") return;
          router.replace("/team");
        }}
        footer={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="min-h-12 flex-1"
              onClick={() => {
                if (scenarioId === "popup-announce") return;
                router.replace("/team");
              }}
            >
              닫기
            </Button>
            <Button
              className="min-h-12 flex-1"
              disabled={saving || !caps.canActLeader}
              onClick={() => void createAnnouncement()}
            >
              게시
            </Button>
          </div>
        }
      >
        <div className="mb-4 space-y-2">
          {displayData!.announcements.length === 0 ? (
            <p className="text-base text-muted">등록된 공지가 없습니다.</p>
          ) : (
            displayData!.announcements.map((item) => (
              <div key={item.id} className="rounded-2xl bg-surface px-3 py-3">
                <p className="text-lg font-semibold">
                  {item.pinned ? "고정, " : ""}
                  {item.title}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-base text-muted">
                  {item.body}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    className="min-h-12"
                    disabled={saving || !caps.canActLeader}
                    onClick={() =>
                      void toggleAnnouncementPin(item.id, item.pinned)
                    }
                  >
                    {item.pinned ? "고정 해제" : "고정"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-12"
                    disabled={saving || !caps.canActLeader}
                    onClick={() => void archiveAnnouncement(item.id)}
                  >
                    보관
                  </Button>
                </div>
              </div>
            ))
          )}
          <p className="pt-2 text-base font-semibold text-foreground">
            새 공지
          </p>
        </div>
        <Input
          className="min-h-12"
          placeholder="제목"
          value={announceTitle}
          onChange={(event) => setAnnounceTitle(event.target.value)}
        />
        <textarea
          className="mt-3 min-h-32 w-full rounded-2xl border border-border bg-card p-3 text-base outline-none focus:ring-2 focus:ring-ring"
          placeholder="내용"
          value={announceBody}
          onChange={(event) => setAnnounceBody(event.target.value)}
        />
      </TeamSheet>

      <TeamSheet
        open={settingsOpen || scenarioId === "popup-settings"}
        title="설정"
        onClose={() => {
          if (scenarioId === "popup-settings") return;
          setSettingsOpen(false);
        }}
      >
        <div className="space-y-1">
          {(
            [
              ["announcementHideAfterRead", "공지 확인 후 숨기기"],
              ["forceMicrophoneOff", "입장 시 마이크 끄기"],
              ["preHostRecordingDefault", "주최자 전 기록 허용"],
              ["preHostRecordingLocked", "주최자 전 기록 잠금"],
              ["allowAdminUnmask", "팀장 언마스크"],
              ["allowExternalSharing", "외부 공유"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex min-h-14 items-center justify-between gap-4"
            >
              <span className="text-base">{label}</span>
              <input
                type="checkbox"
                className="h-5 w-5 accent-primary"
                disabled={!caps.canActOwner || saving}
                checked={Boolean(data.team.policy?.[key])}
                onChange={(event) =>
                  void updatePolicy({ [key]: event.target.checked })
                }
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-base text-muted">
          좌석 {data.team.seatLimit}명
          {caps.canActOwner && data.capabilities.viewAudit
            ? `, 감사 ${data.auditCount}`
            : ""}
        </p>
        {caps.canActOwner ? (
          <Button
            variant="secondary"
            className="mt-4 min-h-12 w-full rounded-full"
            onClick={() => {
              setSettingsOpen(false);
              router.push("/team?manage=members");
            }}
          >
            구성원과 권한
          </Button>
        ) : null}
      </TeamSheet>
    </div>
  );
}
