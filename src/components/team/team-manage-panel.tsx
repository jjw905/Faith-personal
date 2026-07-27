"use client";

import {
  ChevronRight,
  LoaderCircle,
  Search,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { TeamSheet } from "@/components/team/team-sheet";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { useTeamRolePreview } from "@/context/team-role-preview-context";
import { clientGet, invalidateClientFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

type TeamSummary = {
  id: string;
  name: string;
  seatLimit: number;
  memberCount: number;
  role: "OWNER" | "ADMIN" | "MEMBER";
  canInvite: boolean;
  canCreateMeeting: boolean;
  canManageRecordAccess: boolean;
};

type TeamMember = {
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  canInvite: boolean;
  canCreateMeeting: boolean;
  canManageRecordAccess: boolean;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    handle: string | null;
  };
};

type TeamDetail = {
  team: {
    id: string;
    name: string;
    ownerId: string;
    seatLimit: number;
    policy: {
      retentionDays: number;
      allowAdminUnmask: boolean;
      allowExternalSharing: boolean;
    } | null;
  };
  currentMember: TeamMember;
  members: TeamMember[];
  invites: Array<{
    id: string;
    expiresAt: string;
    invitedUser: { id: string; name: string | null; handle: string | null };
  }>;
  meetings: Array<{
    id: string;
    title: string;
    mode: "ONLINE" | "OFFLINE";
    access?: Array<{
      userId: string;
      isParticipant: boolean;
      canReadMasked: boolean;
    }>;
  }>;
};

const ROLE_LABEL = { OWNER: "팀 대표", ADMIN: "팀장", MEMBER: "팀원" };

const CARD_SHADOW =
  "rounded-3xl shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border";

const FIELD_CLASS =
  "min-h-11 rounded-xl bg-surface-2 px-3 text-base font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

function initials(name: string | null, email?: string | null) {
  return (name || email || "?").trim().slice(0, 1).toUpperCase();
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div className="min-w-0 flex-1 pr-3">
        <p className="text-base font-semibold leading-5 text-foreground">
          {label}
        </p>
        {description ? (
          <p className="mt-1 text-base leading-relaxed text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center">{children}</div>
    </div>
  );
}

/** M3 switch: 52×32 track, 24 thumb */
function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-8 w-[52px] shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "justify-end bg-primary" : "justify-start bg-surface-2",
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
  disabled,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex max-w-full flex-wrap rounded-xl bg-surface p-1"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "cursor-pointer rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
            value === option.value
              ? "bg-card text-foreground shadow-soft"
              : "text-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ManageCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("overflow-hidden bg-card outline-none", CARD_SHADOW, className)}
    >
      <div className="space-y-0 px-6 pb-0 pt-6">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {title}
            </h2>
            {description ? (
              <p className="mt-1.5 text-base font-medium text-muted">
                {description}
              </p>
            ) : null}
          </div>
          {action ? (
            <div className="flex shrink-0 items-center gap-1.5">{action}</div>
          ) : null}
        </div>
        <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
      </div>
      <div className="pt-1">{children}</div>
    </section>
  );
}
type TeamManageView = "members" | "security" | "records" | "invite";

const PERMISSION_META: Record<
  "canInvite" | "canCreateMeeting" | "canManageRecordAccess",
  { label: string; description: string }
> = {
  canInvite: {
    label: "멤버 초대",
    description: "팀에 멤버를 초대합니다.",
  },
  canCreateMeeting: {
    label: "회의 만들기",
    description: "팀 일정을 만듭니다.",
  },
  canManageRecordAccess: {
    label: "기록 열람 관리",
    description: "마스킹 기록 열람을 조정합니다.",
  },
};

function MemberPermissionsSheet({
  open,
  member,
  canManage,
  canPromoteToAdmin,
  saving,
  onClose,
  onUpdateRole,
  onUpdatePermission,
}: {
  open: boolean;
  member: TeamMember | null;
  canManage: boolean;
  canPromoteToAdmin: boolean;
  saving: boolean;
  onClose: () => void;
  onUpdateRole: (role: "MEMBER" | "ADMIN") => void;
  onUpdatePermission: (
    key: "canInvite" | "canCreateMeeting" | "canManageRecordAccess",
    value: boolean,
  ) => void;
}) {
  if (!member) return null;

  const isOwner = member.role === "OWNER";
  const title = member.user.name || member.user.handle || "권한";

  return (
    <TeamSheet open={open} title={title} onClose={onClose}>
      <div className="flex items-center gap-4 py-4">
        <Avatar className="h-14 w-14 shrink-0 ring-1 ring-border">
          <AvatarImage src={member.user.image ?? undefined} />
          <AvatarFallback className="bg-white text-lg font-semibold text-foreground">
            {initials(member.user.name, member.user.email)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-foreground">
            {member.user.name || member.user.handle || "이름 없음"}
          </p>
          {member.user.handle ? (
            <p className="truncate text-base text-muted">
              @{member.user.handle}
            </p>
          ) : null}
          <span className="mt-2 inline-flex rounded-lg bg-surface px-2.5 py-1 text-sm font-semibold text-foreground">
            {ROLE_LABEL[member.role]}
          </span>
        </div>
      </div>

      <div className="mt-2 border-t border-border pt-4">
        <p className="mb-2 text-base font-semibold text-foreground">역할</p>
        {isOwner ? (
          <p className="text-base text-muted">팀 대표 역할은 변경할 수 없습니다.</p>
        ) : (
          <Segmented
            ariaLabel="역할"
            value={member.role === "ADMIN" ? "ADMIN" : "MEMBER"}
            disabled={!canManage || saving}
            onChange={(value) => onUpdateRole(value as "MEMBER" | "ADMIN")}
            options={[
              { value: "MEMBER", label: "팀원" },
              ...(canPromoteToAdmin
                ? [{ value: "ADMIN", label: "팀장" }]
                : []),
            ]}
          />
        )}
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <p className="mb-1 text-base font-semibold text-foreground">위임 권한</p>
        {isOwner ? (
          <p className="mt-2 text-base text-muted">팀 대표는 모든 권한을 가집니다.</p>
        ) : (
          <div className="divide-y divide-border">
            {(
              [
                "canInvite",
                "canCreateMeeting",
                "canManageRecordAccess",
              ] as const
            ).map((key) => (
              <SettingRow
                key={key}
                label={PERMISSION_META[key].label}
                description={PERMISSION_META[key].description}
              >
                <Toggle
                  label={PERMISSION_META[key].label}
                  checked={member[key]}
                  disabled={!canManage || saving}
                  onChange={(value) => onUpdatePermission(key, value)}
                />
              </SettingRow>
            ))}
          </div>
        )}
      </div>
    </TeamSheet>
  );
}

function MemberRecordAccessSheet({
  open,
  member,
  meetings,
  saving,
  bulkConfirmed,
  onClose,
  onBulkConfirmChange,
  onToggleMeeting,
  onApplyAll,
}: {
  open: boolean;
  member: TeamMember | null;
  meetings: TeamDetail["meetings"];
  saving: boolean;
  bulkConfirmed: boolean;
  onClose: () => void;
  onBulkConfirmChange: (value: boolean) => void;
  onToggleMeeting: (meetingId: string, canReadMasked: boolean) => void;
  onApplyAll: (canReadMasked: boolean) => void;
}) {
  if (!member) return null;

  const title = member.user.name || member.user.handle || "기록 열람";

  return (
    <TeamSheet open={open} title={title} onClose={onClose}>
      <div className="flex items-center gap-4 py-4">
        <Avatar className="h-12 w-12 shrink-0 ring-1 ring-border">
          <AvatarImage src={member.user.image ?? undefined} />
          <AvatarFallback className="bg-white text-sm font-semibold text-foreground">
            {initials(member.user.name, member.user.email)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-foreground">
            {member.user.name || member.user.handle}
          </p>
          <p className="text-base text-muted">{ROLE_LABEL[member.role]}</p>
        </div>
      </div>

      {meetings.length === 0 ? (
        <p className="mt-4 border-t border-border px-0 py-8 text-center text-base text-muted">
          열람을 설정할 회의 기록이 없습니다.
        </p>
      ) : (
        <>
          <div className="mt-2 divide-y divide-border border-t border-border">
            {meetings.map((meeting) => {
              const meetingAccess = meeting.access?.find(
                (access) => access.userId === member.userId,
              );
              return (
                <SettingRow
                  key={meeting.id}
                  label={meeting.title}
                  description={
                    meetingAccess?.isParticipant ? "참가자" : undefined
                  }
                >
                  <Toggle
                    label={`${meeting.title} 기록 열람`}
                    checked={Boolean(meetingAccess?.canReadMasked)}
                    disabled={saving || member.role === "OWNER"}
                    onChange={(value) => onToggleMeeting(meeting.id, value)}
                  />
                </SettingRow>
              );
            })}
          </div>

          <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-surface px-4 text-base">
            <input
              type="checkbox"
              checked={bulkConfirmed}
              onChange={(event) => onBulkConfirmChange(event.target.checked)}
              className="h-5 w-5 accent-primary"
            />
            기존 회의 {meetings.length}건 일괄 적용
          </label>
          {bulkConfirmed ? (
            <div className="mt-3 flex gap-2">
              <Button
                variant="secondary"
                className="min-h-12 flex-1 rounded-xl"
                onClick={() => onApplyAll(false)}
                disabled={saving}
              >
                모두 해제
              </Button>
              <Button
                className="min-h-12 flex-1 rounded-xl"
                onClick={() => onApplyAll(true)}
                disabled={saving}
              >
                모두 허용
              </Button>
            </div>
          ) : null}
        </>
      )}
    </TeamSheet>
  );
}

export function TeamManagePanel({
  view = "members",
}: {
  view?: TeamManageView;
}) {
  const router = useRouter();
  const { scenarioId, isLive } = usePageUxPreview();
  const { resolveRole, isPreviewing } = useTeamRolePreview();
  const { activeTeamId, setActiveTeamId } = useAppContext();
  const [teams, setTeams] = useState<TeamSummary[]>([]);
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [bulkConfirmed, setBulkConfirmed] = useState(false);

  const activeTeamIdRef = useRef(activeTeamId);
  activeTeamIdRef.current = activeTeamId;

  const loadTeams = useCallback(async () => {
    setLoading(true);
    try {
      const response = await clientGet("/api/teams");
      const data = (await response.json()) as {
        ok?: boolean;
        teams?: TeamSummary[];
        message?: string;
      };
      if (response.ok && data.ok) {
        const nextTeams = data.teams ?? [];
        setTeams(nextTeams);
        const current = activeTeamIdRef.current;
        const validActive = nextTeams.some((team) => team.id === current);
        const nextId = validActive ? current : (nextTeams[0]?.id ?? null);
        if (nextId !== current) setActiveTeamId(nextId);
      } else {
        setMessage(data.message ?? "팀 정보를 불러오지 못했습니다.");
      }
    } catch {
      setMessage("팀 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [setActiveTeamId]);

  const loadDetail = useCallback(async (teamId: string) => {
    try {
      const response = await clientGet(`/api/teams/${teamId}`);
      if (activeTeamIdRef.current !== teamId) return;
      const data = (await response.json()) as TeamDetail & {
        ok?: boolean;
        message?: string;
      };
      if (response.ok && data.ok) {
        setDetail(data);
        setSelectedUserId((current) =>
          current && data.members.some((member) => member.userId === current)
            ? current
            : null,
        );
      } else {
        setMessage(data.message ?? "팀 상세 정보를 불러오지 못했습니다.");
      }
    } catch {
      if (activeTeamIdRef.current === teamId) {
        setMessage("팀 상세 정보를 불러오지 못했습니다.");
      }
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadTeams());
  }, [loadTeams]);

  useEffect(() => {
    if (!activeTeamId) return;
    queueMicrotask(() => void loadDetail(activeTeamId));
  }, [activeTeamId, loadDetail]);

  const refreshDetail = useCallback(
    async (teamId: string) => {
      invalidateClientFetch(`/api/teams/${teamId}`);
      invalidateClientFetch("/api/teams");
      await loadDetail(teamId);
    },
    [loadDetail],
  );

  const selected = useMemo(
    () =>
      detail?.members.find((member) => member.userId === selectedUserId) ??
      null,
    [detail?.members, selectedUserId],
  );
  const role = detail
    ? resolveRole(detail.currentMember.role)
    : undefined;
  const isOwner = role === "OWNER";
  const isLeader = role === "OWNER" || role === "ADMIN";
  const canManage = isLeader;
  const canInvite = isPreviewing
    ? isLeader
    : canManage || Boolean(detail?.currentMember.canInvite);
  const canManageRecords = isPreviewing
    ? isLeader
    : canManage || Boolean(detail?.currentMember.canManageRecordAccess);
  const viewDenied = Boolean(
    detail &&
    !(
      (view === "members" && isOwner) ||
      (view === "security" && isOwner) ||
      (view === "records" && canManageRecords) ||
      (view === "invite" && canInvite)
    ),
  );

  const previewMembers = useMemo(() => {
    if (!detail) return [] as TeamMember[];
    if (scenarioId === "empty") return [];
    if (
      scenarioId === "full" ||
      scenarioId === "popup-member" ||
      scenarioId === "popup-access"
    ) {
      if (detail.members.length >= (scenarioId === "full" ? 8 : 1)) {
        return detail.members;
      }
      const count = scenarioId === "full" ? 8 : Math.max(detail.members.length, 1);
      const extras: TeamMember[] = Array.from({ length: count }, (_, index) => ({
        userId: `ux-member-${index + 1}`,
        role: index === 0 ? ("OWNER" as const) : index < 3 ? ("ADMIN" as const) : ("MEMBER" as const),
        canInvite: index < 3,
        canCreateMeeting: true,
        canManageRecordAccess: index < 3,
        user: {
          id: `ux-member-${index + 1}`,
          name: `미리보기 멤버 ${index + 1}`,
          email: `ux${index + 1}@example.com`,
          image: null,
          handle: `ux${index + 1}`,
        },
      }));
      return detail.members.length > 0 ? detail.members : extras;
    }
    return detail.members;
  }, [detail, scenarioId]);

  const previewSelected = useMemo(
    () =>
      previewMembers.find((member) => member.userId === selectedUserId) ??
      selected,
    [previewMembers, selected, selectedUserId],
  );

  const previewMeetings = useMemo(() => {
    if (!detail) return [] as TeamDetail["meetings"];
    if (scenarioId === "empty") return [];
    if (scenarioId === "full" || scenarioId === "popup-access") {
      if (detail.meetings.length >= (scenarioId === "full" ? 6 : 1)) {
        return detail.meetings;
      }
      return Array.from({ length: scenarioId === "full" ? 6 : 3 }, (_, index) => ({
        id: `ux-tm-${index + 1}`,
        title: `팀 회의 기록 ${index + 1}`,
        mode: index % 2 === 0 ? ("ONLINE" as const) : ("OFFLINE" as const),
        access: [],
      }));
    }
    return detail.meetings;
  }, [detail, scenarioId]);

  useEffect(() => {
    if (scenarioId === "popup-invite" || scenarioId === "popup-invite-search") {
      setShowInvite(true);
      setSelectedUserId(null);
      return;
    }
    if (scenarioId === "popup-member" || scenarioId === "popup-access") {
      setShowInvite(false);
      const first = previewMembers[0]?.userId ?? null;
      setSelectedUserId(first);
      return;
    }
    if (
      scenarioId === "live" ||
      scenarioId === "empty" ||
      scenarioId === "full" ||
      scenarioId === "loading"
    ) {
      setShowInvite(false);
      setSelectedUserId(null);
    }
  }, [previewMembers, scenarioId]);

  async function updateMember(
    userId: string,
    patch: Partial<TeamMember>,
  ) {
    const member = detail?.members.find((row) => row.userId === userId);
    if (!detail || !member || member.role === "OWNER") return;
    setSaving(true);
    if (!isLive) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      setSaving(false);
      return;
    }
    const response = await fetch(
      `/api/teams/${detail.team.id}/members/${userId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    const data = (await response.json()) as { ok?: boolean; message?: string };
    setSaving(false);
    if (!response.ok || !data.ok) {
      setMessage(data.message ?? "권한을 저장하지 못했습니다.");
      return;
    }
    await refreshDetail(detail.team.id);
  }

  async function updatePolicy(patch: Record<string, unknown>) {
    if (!detail) return;
    setSaving(true);
    if (!isLive) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      setSaving(false);
      return;
    }
    const response = await fetch(`/api/teams/${detail.team.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await response.json()) as { ok?: boolean; message?: string };
    setSaving(false);
    if (!response.ok || !data.ok) {
      setMessage(data.message ?? "정책을 저장하지 못했습니다.");
      return;
    }
    await refreshDetail(detail.team.id);
  }

  async function updateMeetingAccess(
    userId: string,
    meetingId: string,
    canReadMasked: boolean,
  ) {
    if (!detail) return;
    setSaving(true);
    if (!isLive) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      setSaving(false);
      return;
    }
    const response = await fetch(`/api/team-meetings/${meetingId}/access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, canReadMasked }),
    });
    const data = (await response.json()) as { ok?: boolean; message?: string };
    setSaving(false);
    if (!response.ok || !data.ok) {
      setMessage(data.message ?? "회의 기록 권한을 저장하지 못했습니다.");
      return;
    }
    await refreshDetail(detail.team.id);
  }

  async function applyMeetingAccessToAll(
    userId: string,
    canReadMasked: boolean,
  ) {
    if (!detail || !bulkConfirmed) return;
    setSaving(true);
    if (!isLive) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      setSaving(false);
      setBulkConfirmed(false);
      return;
    }
    const response = await fetch(
      `/api/teams/${detail.team.id}/meeting-access/bulk`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          canReadMasked,
          confirmCount: detail.meetings.length,
        }),
      },
    );
    const data = (await response.json()) as { ok?: boolean; message?: string };
    setSaving(false);
    if (!response.ok || !data.ok) {
      setMessage(data.message ?? "기존 회의에 적용하지 못했습니다.");
      return;
    }
    setBulkConfirmed(false);
    await refreshDetail(detail.team.id);
  }

  useEffect(() => {
    if (loading || !detail || !viewDenied || isPreviewing) return;
    router.replace("/team");
  }, [detail, isPreviewing, loading, router, viewDenied]);

  if (loading || scenarioId === "loading") {
    return (
      <div className={cn("grid min-h-56 place-items-center bg-card", CARD_SHADOW)}>
        <LoaderCircle
          className="h-6 w-6 animate-spin text-muted"
          aria-label="불러오는 중"
        />
      </div>
    );
  }

  if (viewDenied) {
    return (
      <div
        className={cn(
          "grid min-h-56 place-items-center bg-card p-6 text-center",
          CARD_SHADOW,
        )}
      >
        <p className="text-base text-muted">이 관리 화면은 권한이 없습니다.</p>
        <Button asChild variant="secondary" className="mt-4 min-h-11 rounded-xl">
          <Link href="/team">팀 공간으로</Link>
        </Button>
      </div>
    );
  }

  if (view === "invite" && detail && canInvite) {
    return (
      <InviteDialog
        teamId={detail.team.id}
        canInviteAdmin={isOwner}
        onClose={() => {
          if (scenarioId === "popup-invite" || scenarioId === "popup-invite-search") return;
          router.replace("/team");
        }}
        onComplete={async () => {
          await refreshDetail(detail.team.id);
          if (scenarioId === "popup-invite" || scenarioId === "popup-invite-search") return;
          router.replace("/team");
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {message ? (
        <div className="flex min-h-12 items-center justify-between gap-3 rounded-2xl bg-primary-soft px-4 py-3 text-base text-foreground">
          <span className="min-w-0 flex-1">{message}</span>
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-card/60 hover:text-foreground"
            onClick={() => setMessage("")}
            aria-label="닫기"
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
      ) : null}

      {teams.length === 0 ? (
        <ManageCard title="팀">
          <div className="px-6 py-12 text-center">
            <UsersRound className="mx-auto h-10 w-10 text-muted-2" strokeWidth={1.5} />
            <p className="mt-4 text-lg font-semibold text-foreground">
              참여 중인 팀이 없습니다
            </p>
            <p className="mt-1 text-base text-muted">
              초대를 수락하거나 팀 플랜으로 시작하세요.
            </p>
          </div>
        </ManageCard>
      ) : (
        <>
          {teams.length > 1 ? (
            <label className="block max-w-md">
              <span className="mb-2 block text-base font-semibold text-foreground">
                팀
              </span>
              <select
                value={activeTeamId ?? ""}
                onChange={(event) => setActiveTeamId(event.target.value)}
                className={cn(FIELD_CLASS, "w-full min-h-12 font-semibold")}
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name}, {team.memberCount}/{team.seatLimit}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {detail ? (
            view === "security" ? (
              <ManageCard
                title="팀 보안 정책"
                description="팀 워크스페이스에 적용되며, 개인 설정보다 우선할 수 있습니다."
              >
                <div className="divide-y divide-border px-6 pb-2">
                  <SettingRow
                    label="데이터 보존 기간"
                    description="회의 기록과 알림 보관에 적용됩니다."
                  >
                    <Segmented
                      ariaLabel="데이터 보존 기간"
                      value={String(detail.team.policy?.retentionDays ?? 90)}
                      disabled={saving}
                      onChange={(value) =>
                        void updatePolicy({ retentionDays: Number(value) })
                      }
                      options={[
                        { value: "30", label: "30일" },
                        { value: "60", label: "60일" },
                        { value: "90", label: "90일" },
                      ]}
                    />
                  </SettingRow>
                  <SettingRow
                    label="팀장 언마스크"
                    description="마스킹된 개인정보를 팀장이 원문으로 볼 수 있습니다."
                  >
                    <Toggle
                      label="팀장 언마스크"
                      checked={Boolean(detail.team.policy?.allowAdminUnmask)}
                      disabled={saving}
                      onChange={(value) =>
                        void updatePolicy({ allowAdminUnmask: value })
                      }
                    />
                  </SettingRow>
                  <SettingRow
                    label="외부 공유"
                    description="팀 밖 공유를 허용합니다."
                  >
                    <Toggle
                      label="외부 공유"
                      checked={Boolean(detail.team.policy?.allowExternalSharing)}
                      disabled={saving}
                      onChange={(value) =>
                        void updatePolicy({ allowExternalSharing: value })
                      }
                    />
                  </SettingRow>
                </div>
              </ManageCard>
            ) : (
              <ManageCard
                title={view === "records" ? "기록 열람" : "구성원"}
                description={
                  view === "records"
                    ? "멤버를 선택해 마스킹 기록 열람을 켭니다."
                    : "역할과 위임 권한을 설정합니다."
                }
                action={
                  canInvite && view === "members" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-12 w-12 rounded-full text-muted hover:bg-surface hover:text-foreground"
                      onClick={() => setShowInvite(true)}
                      aria-label="멤버 초대"
                    >
                      <UserRoundPlus className="h-5 w-5" strokeWidth={1.75} />
                    </Button>
                  ) : null
                }
              >
                <div className="divide-y divide-border">
                  {previewMembers.length === 0 ? (
                    <p className="px-6 py-10 text-center text-base text-muted">
                      표시할 멤버가 없습니다.
                    </p>
                  ) : (
                    previewMembers.map((member) => (
                      <button
                        type="button"
                        key={member.userId}
                        onClick={() => {
                          setSelectedUserId(member.userId);
                          setBulkConfirmed(false);
                        }}
                        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-6 py-4 text-left transition-colors hover:bg-surface/70 sm:gap-4 sm:py-5"
                      >
                        <Avatar className="h-11 w-11 shrink-0 ring-1 ring-border">
                          <AvatarImage src={member.user.image ?? undefined} />
                          <AvatarFallback className="bg-white text-sm font-semibold text-foreground">
                            {initials(member.user.name, member.user.email)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="min-w-0">
                          <span className="block truncate text-lg font-semibold text-foreground">
                            {member.user.name || member.user.handle}
                          </span>
                          <span className="mt-1 block text-base text-muted">
                            {ROLE_LABEL[member.role]}
                            {member.user.handle
                              ? `, @${member.user.handle}`
                              : ""}
                          </span>
                        </span>
                        <ChevronRight
                          className="h-5 w-5 shrink-0 text-muted-2"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      </button>
                    ))
                  )}
                </div>
              </ManageCard>
            )
          ) : null}
        </>
      )}

      {showInvite ||
      scenarioId === "popup-invite" ||
      scenarioId === "popup-invite-search" ? (
        detail && canInvite ? (
        <InviteDialog
          teamId={detail.team.id}
          canInviteAdmin={isOwner}
          onClose={() => {
            if (
              scenarioId === "popup-invite" ||
              scenarioId === "popup-invite-search"
            ) {
              return;
            }
            setShowInvite(false);
          }}
          onComplete={async () => {
            if (
              scenarioId !== "popup-invite" &&
              scenarioId !== "popup-invite-search"
            ) {
              setShowInvite(false);
            }
            await refreshDetail(detail.team.id);
          }}
        />
        ) : null
      ) : null}

      {view === "members" && previewSelected ? (
        <MemberPermissionsSheet
          open={Boolean(selectedUserId) || scenarioId === "popup-member"}
          member={previewSelected}
          canManage={canManage}
          canPromoteToAdmin={detail?.currentMember.role === "OWNER"}
          saving={saving}
          onClose={() => {
            if (scenarioId === "popup-member") return;
            setSelectedUserId(null);
          }}
          onUpdateRole={(role) =>
            void updateMember(previewSelected.userId, { role })
          }
          onUpdatePermission={(key, value) =>
            void updateMember(previewSelected.userId, { [key]: value })
          }
        />
      ) : null}

      {view === "records" && previewSelected && canManageRecords ? (
        <MemberRecordAccessSheet
          open={Boolean(selectedUserId) || scenarioId === "popup-access"}
          member={previewSelected}
          meetings={previewMeetings}
          saving={saving}
          bulkConfirmed={bulkConfirmed}
          onClose={() => {
            if (scenarioId === "popup-access") return;
            setSelectedUserId(null);
          }}
          onBulkConfirmChange={setBulkConfirmed}
          onToggleMeeting={(meetingId, value) =>
            void updateMeetingAccess(previewSelected.userId, meetingId, value)
          }
          onApplyAll={(value) =>
            void applyMeetingAccessToAll(previewSelected.userId, value)
          }
        />
      ) : null}
    </div>
  );
}

function InviteDialog({
  teamId,
  canInviteAdmin,
  onClose,
  onComplete,
}: {
  teamId: string;
  canInviteAdmin: boolean;
  onClose: () => void;
  onComplete: () => Promise<void>;
}) {
  const { scenarioId, isLive } = usePageUxPreview();
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState<{
    id: string;
    name: string | null;
    handle: string | null;
    alreadyMember: boolean;
    pendingInvite: { id: string } | null;
  } | null>(null);
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [permissions, setPermissions] = useState({
    canInvite: false,
    canCreateMeeting: false,
    canManageRecordAccess: false,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const previewSearching = scenarioId === "popup-invite-search";
  const searching = loading || previewSearching;

  async function search() {
    setLoading(true);
    const response = await fetch(
      `/api/teams/${teamId}/people?query=${encodeURIComponent(query)}`,
      { cache: "no-store" },
    );
    const data = (await response.json()) as {
      ok?: boolean;
      person?: typeof person;
      message?: string;
    };
    setLoading(false);
    setPerson(data.person ?? null);
    setMessage(
      data.person ? "" : (data.message ?? "사용자를 찾지 못했습니다."),
    );
  }

  async function invite() {
    if (!person) return;
    setLoading(true);
    if (!isLive) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      setLoading(false);
      await onComplete();
      return;
    }
    const response = await fetch(`/api/teams/${teamId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: person.id, role, ...permissions }),
    });
    const data = (await response.json()) as { ok?: boolean; message?: string };
    setLoading(false);
    if (!response.ok || !data.ok) {
      setMessage(data.message ?? "초대하지 못했습니다.");
      return;
    }
    await onComplete();
  }

  const canSubmit =
    person && !person.alreadyMember && !person.pendingInvite && !searching;

  useEffect(() => {
    if (previewSearching) {
      setQuery("@preview");
      setPerson(null);
      setMessage("");
    }
  }, [previewSearching]);

  return (
    <TeamSheet
      open
      title="멤버 초대"
      onClose={onClose}
      footer={
        canSubmit ? (
          <Button
            className="min-h-12 w-full rounded-xl"
            onClick={() => void invite()}
            disabled={searching}
          >
            초대 보내기
          </Button>
        ) : null
      }
    >
      <label className="relative flex min-h-12 items-center rounded-xl bg-surface-2 px-3 focus-within:ring-2 focus-within:ring-ring">
        <Search
          className="h-5 w-5 shrink-0 text-muted-2"
          strokeWidth={1.75}
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void search();
          }}
          placeholder="@아이디"
          className="min-w-0 flex-1 bg-transparent px-2.5 text-base text-foreground outline-none placeholder:text-muted"
          autoComplete="off"
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 shrink-0 gap-1.5 rounded-lg px-3 text-base font-semibold"
          onClick={() => void search()}
          disabled={searching}
        >
          {searching ? (
            <LoaderCircle
              className="h-4 w-4 animate-spin"
              strokeWidth={1.75}
              aria-hidden
            />
          ) : null}
          검색
        </Button>
      </label>

      {searching ? (
        <p className="mt-3 text-base text-muted">사용자를 찾는 중…</p>
      ) : null}

      {message && !searching ? (
        <p className="mt-3 text-base text-muted">{message}</p>
      ) : null}

      {person ? (
        <div className="mt-4 border-t border-border pt-1">
          <div className="py-3.5">
            <p className="text-lg font-semibold text-foreground">
              {person.name || person.handle}
            </p>
            <p className="text-base text-muted">@{person.handle}</p>
          </div>
          {person.alreadyMember || person.pendingInvite ? (
            <p className="border-t border-border py-4 text-base text-muted">
              {person.alreadyMember
                ? "이미 팀에 참여 중입니다."
                : "초대 응답 대기 중입니다."}
            </p>
          ) : (
            <div className="divide-y divide-border border-t border-border">
              <SettingRow label="역할">
                <select
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as "MEMBER" | "ADMIN")
                  }
                  className={cn(FIELD_CLASS, "min-w-[6.5rem]")}
                >
                  <option value="MEMBER">팀원</option>
                  {canInviteAdmin ? (
                    <option value="ADMIN">팀장</option>
                  ) : null}
                </select>
              </SettingRow>
              {(
                [
                  ["canInvite", "멤버 초대"],
                  ["canCreateMeeting", "회의 만들기"],
                  ["canManageRecordAccess", "기록 열람 관리"],
                ] as const
              ).map(([key, label]) => (
                <SettingRow
                  key={key}
                  label={label}
                  description={PERMISSION_META[key].description}
                >
                  <Toggle
                    label={label}
                    checked={permissions[key]}
                    onChange={(value) =>
                      setPermissions((current) => ({
                        ...current,
                        [key]: value,
                      }))
                    }
                  />
                </SettingRow>
              ))}
              <p className="py-3.5 text-base text-muted">
                초대는 1시간 후 만료됩니다.
              </p>
            </div>
          )}
        </div>
      ) : null}
    </TeamSheet>
  );
}
