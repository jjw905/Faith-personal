"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { NewMeetingSession } from "@/components/meetings/new-meeting-session";
import {
  TeamMeetingComposer,
  type TeamMeetingComposerValues,
} from "@/components/team/team-meeting-composer";
import type { ParticipantOption } from "@/components/team/participant-chip-picker";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { clientGet } from "@/lib/client-fetch";
import type { WorkspaceId } from "@/lib/workspaces";

type TeamOption = {
  id: string;
  name: string;
  canCreateMeeting: boolean;
  role: "OWNER" | "ADMIN" | "MEMBER";
};

export function NewMeetingSetup({
  initialWorkspace,
  initialIntent = "start",
  fixedIntent,
}: {
  initialWorkspace?: WorkspaceId;
  initialIntent?: "start" | "schedule";
  fixedIntent?: "start" | "schedule";
}) {
  const router = useRouter();
  const { activeTeamId, setActiveTeamId, workspaceId } = useAppContext();
  const { scenarioId, isLive } = usePageUxPreview();
  const currentWorkspace = initialWorkspace ?? workspaceId;
  const isTeamWorkspace = currentWorkspace === "team";
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [joinedTeamCount, setJoinedTeamCount] = useState(0);
  const [members, setMembers] = useState<ParticipantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const activeTeamIdRef = useRef(activeTeamId);
  activeTeamIdRef.current = activeTeamId;

  useEffect(() => {
    if (!isTeamWorkspace) return;
    let cancelled = false;
    async function load() {
      try {
        const response = await clientGet("/api/teams");
        const data = (await response.json()) as {
          ok?: boolean;
          teams?: TeamOption[];
        };
        if (cancelled) return;
        const joinedTeams = data.teams ?? [];
        const allowed = joinedTeams.filter(
          (team) =>
            team.role === "OWNER" ||
            team.role === "ADMIN" ||
            team.canCreateMeeting,
        );
        setJoinedTeamCount(joinedTeams.length);
        setTeams(allowed);
        if (!allowed.some((team) => team.id === activeTeamIdRef.current)) {
          setActiveTeamId(allowed[0]?.id ?? null);
        }
      } catch {
        if (!cancelled) {
          setTeams([]);
          setJoinedTeamCount(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [isTeamWorkspace, setActiveTeamId]);

  useEffect(() => {
    if (!isTeamWorkspace || !activeTeamId) return;
    let cancelled = false;
    async function loadMembers() {
      try {
        const response = await clientGet(`/api/teams/${activeTeamId}`);
        const data = (await response.json()) as {
          ok?: boolean;
          members?: ParticipantOption[];
          currentMember?: { userId: string };
        };
        if (cancelled) return;
        const others = (data.members ?? []).filter(
          (member) => member.userId !== data.currentMember?.userId,
        );
        setMembers(others);
      } catch {
        if (!cancelled) setMembers([]);
      }
    }
    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [activeTeamId, isTeamWorkspace]);

  async function createMeeting(values: TeamMeetingComposerValues) {
    if (!activeTeamId || !values.title.trim()) {
      setMessage("팀과 제목을 확인해 주세요.");
      return;
    }
    if (values.participantIds.length === 0) {
      setMessage("함께할 팀원을 선택해 주세요.");
      return;
    }
    if (values.intent === "schedule" && !values.start) {
      setMessage("시작 시각을 확인해 주세요.");
      return;
    }
    setSaving(true);
    setMessage("");
    if (!isLive) {
      await new Promise((resolve) => window.setTimeout(resolve, 400));
      setSaving(false);
      setMessage("미리보기에서는 회의를 만들지 않습니다.");
      return;
    }
    const response = await fetch("/api/team-meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamId: activeTeamId,
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
    const data = (await response.json()) as {
      ok?: boolean;
      href?: string;
      message?: string;
    };
    if (!response.ok || !data.ok || !data.href) {
      setMessage(data.message ?? "회의를 만들지 못했습니다.");
      setSaving(false);
      return;
    }
    router.push(data.href);
  }

  if (!isTeamWorkspace) {
    return <NewMeetingSession />;
  }

  const viewLoading = loading || scenarioId === "loading";
  const viewTeams = scenarioId === "empty" ? [] : teams;
  const viewJoinedTeamCount = scenarioId === "empty" ? 0 : joinedTeamCount;

  return (
    <PageContainer soft>
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-5">
          <Link
            href="/team"
            className="inline-flex min-h-12 items-center gap-1.5 rounded-xl px-1 text-base text-muted transition-colors hover:bg-surface hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
            돌아가기
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {fixedIntent === "schedule" ? "회의 일정 만들기" : "실시간 회의"}
          </h1>
          <p className="mt-1 text-base text-muted">
            {fixedIntent === "schedule"
              ? "참석자와 시작 시각을 정해 팀 일정에 추가합니다."
              : "참석자를 초대하고 음성 회의를 바로 시작합니다."}
          </p>
        </header>
        <section className="panel-surface rounded-2xl bg-card p-6">
          {viewLoading ? (
            <div className="grid min-h-64 place-items-center">
              <LoaderCircle
                className="h-6 w-6 animate-spin text-muted"
                aria-label="불러오는 중"
              />
            </div>
          ) : viewTeams.length === 0 ? (
            <div className="grid min-h-64 place-items-center rounded-2xl bg-surface p-6 text-center">
              <div className="max-w-sm">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  {viewJoinedTeamCount === 0
                    ? "팀을 먼저 구성해 주세요"
                    : "회의 생성 권한이 없습니다"}
                </h2>
                <p className="mt-2 text-base leading-6 text-muted">
                  {viewJoinedTeamCount === 0
                    ? "팀 회의는 팀을 만든 후 시작할 수 있습니다."
                    : "팀장에게 회의 생성 권한을 요청해 주세요."}
                </p>
                <Button asChild className="mt-6 min-h-12 rounded-full px-6">
                  <Link href="/team">
                    {viewJoinedTeamCount === 0 ? "팀 시작" : "팀 공간으로"}
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <TeamMeetingComposer
              key={`${activeTeamId ?? "none"}-${initialIntent}`}
              members={members}
              initialIntent={initialIntent}
              fixedIntent={fixedIntent}
              showTeamSelect
              teams={viewTeams}
              teamId={activeTeamId}
              onTeamChange={setActiveTeamId}
              teamsLoading={loading}
              saving={saving}
              message={message}
              onSubmit={createMeeting}
            />
          )}
        </section>
      </div>
    </PageContainer>
  );
}
