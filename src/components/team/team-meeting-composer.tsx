"use client";

import { CalendarClock, Headphones } from "lucide-react";
import { useMemo, useState } from "react";

import {
  ParticipantChipPicker,
  type ParticipantOption,
} from "@/components/team/participant-chip-picker";
import { displayPersonName } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type MeetingIntent = "start" | "schedule";

const DURATION_PRESETS = [30, 60, 90] as const;

export type TeamMeetingComposerValues = {
  intent: MeetingIntent;
  title: string;
  start: string;
  durationMinutes: number;
  participantIds: string[];
  backupHostId: string;
};

export function TeamMeetingComposer({
  members,
  initialIntent = "start",
  showTeamSelect,
  teams,
  teamId,
  onTeamChange,
  teamsLoading,
  saving,
  message,
  onSubmit,
  className,
  compact,
}: {
  members: ParticipantOption[];
  initialIntent?: MeetingIntent;
  showTeamSelect?: boolean;
  teams?: Array<{ id: string; name: string }>;
  teamId?: string | null;
  onTeamChange?: (teamId: string) => void;
  teamsLoading?: boolean;
  saving?: boolean;
  message?: string;
  onSubmit: (values: TeamMeetingComposerValues) => void | Promise<void>;
  className?: string;
  compact?: boolean;
}) {
  const [intent, setIntent] = useState<MeetingIntent>(initialIntent);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [customDuration, setCustomDuration] = useState(false);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [backupHostId, setBackupHostId] = useState("");
  const [backupOpen, setBackupOpen] = useState(false);

  const presetActive = useMemo(
    () =>
      !customDuration &&
      DURATION_PRESETS.includes(
        durationMinutes as (typeof DURATION_PRESETS)[number],
      ),
    [customDuration, durationMinutes],
  );

  function submit() {
    void onSubmit({
      intent,
      title,
      start,
      durationMinutes,
      participantIds,
      backupHostId,
    });
  }

  return (
    <div className={cn("space-y-5", className)}>
      <div>
        <p className="sr-only">진행 방식</p>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["start", "바로 시작", Headphones],
              ["schedule", "일정", CalendarClock],
            ] as const
          ).map(([value, label, Icon]) => {
            const selected = intent === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={selected}
                onClick={() => setIntent(value)}
                className={cn(
                  "group flex min-h-24 origin-center items-center gap-3 rounded-2xl px-4 text-left shadow-soft transition-[transform,box-shadow,background-color,color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-colors",
                  selected
                    ? "bg-primary text-primary-foreground hover:bg-primary-hover"
                    : "bg-surface text-foreground hover:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none group-hover:scale-105 motion-reduce:group-hover:scale-100",
                    selected
                      ? "bg-white text-primary"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="text-lg font-semibold tracking-tight">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {showTeamSelect ? (
        <label className="block text-base font-medium">
          팀
          <select
            value={teamId ?? ""}
            onChange={(event) => onTeamChange?.(event.target.value)}
            disabled={teamsLoading || !teams?.length}
            className="mt-2 min-h-12 w-full rounded-2xl border border-border bg-card px-4 text-base outline-none focus:ring-2 focus:ring-ring"
          >
            {(teams ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="block text-base font-medium">
        제목
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-2 min-h-12 text-base"
          maxLength={100}
          placeholder="제목"
        />
      </label>

      <div
        className={cn(
          "grid overflow-hidden transition-[grid-template-rows,opacity] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          intent === "schedule"
            ? "grid-rows-[1fr] opacity-100"
            : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
        aria-hidden={intent !== "schedule"}
        inert={intent !== "schedule" ? true : undefined}
      >
        <div className="min-h-0 overflow-hidden">
          <label className="block text-base font-medium">
            시작
            <Input
              type="datetime-local"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              className="mt-2 min-h-12 text-base"
              tabIndex={intent === "schedule" ? 0 : -1}
            />
          </label>
        </div>
      </div>

      <div>
        <p className="text-base font-medium">시간</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DURATION_PRESETS.map((minutes) => {
            const selected = presetActive && durationMinutes === minutes;
            return (
              <button
                key={minutes}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setCustomDuration(false);
                  setDurationMinutes(minutes);
                }}
                className={cn(
                  "inline-flex min-h-12 min-w-14 items-center justify-center rounded-full px-4 text-base font-semibold transition-colors duration-[180ms] motion-reduce:transition-none",
                  selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface text-foreground hover:bg-surface-2",
                )}
              >
                {minutes}
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={customDuration || !presetActive}
            onClick={() => setCustomDuration(true)}
            className={cn(
              "inline-flex min-h-12 items-center justify-center rounded-full px-4 text-base font-semibold transition-colors duration-[180ms] motion-reduce:transition-none",
              customDuration || !presetActive
                ? "bg-primary text-primary-foreground"
                : "bg-surface text-foreground hover:bg-surface-2",
            )}
          >
            직접
          </button>
        </div>
        {customDuration || !presetActive ? (
          <Input
            type="number"
            min={5}
            max={480}
            value={durationMinutes}
            onChange={(event) => {
              setCustomDuration(true);
              setDurationMinutes(Number(event.target.value));
            }}
            className="mt-2 min-h-12 max-w-[8rem] text-base"
            aria-label="시간(분)"
          />
        ) : null}
      </div>

      <ParticipantChipPicker
        members={members}
        selectedIds={participantIds}
        onChange={(ids) => {
          setParticipantIds(ids);
          if (!ids.includes(backupHostId)) setBackupHostId("");
          if (ids.length === 0) setBackupOpen(false);
        }}
      />

      {participantIds.length > 0 ? (
        <div>
          {!backupOpen ? (
            <button
              type="button"
              className="min-h-12 text-base font-semibold text-muted hover:text-foreground"
              onClick={() => setBackupOpen(true)}
            >
              대리 주최
            </button>
          ) : (
            <label className="block text-base font-medium">
              대리 주최
              <select
                value={backupHostId}
                onChange={(event) => setBackupHostId(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-2xl border border-border bg-card px-4 text-base outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">없음</option>
                {participantIds.map((id) => {
                  const member = members.find((row) => row.userId === id);
                  return (
                    <option key={id} value={id}>
                      {displayPersonName(
                        member?.user.name,
                        member?.user.handle,
                      )}
                    </option>
                  );
                })}
              </select>
            </label>
          )}
        </div>
      ) : null}

      {message ? <p className="text-base text-muted">{message}</p> : null}

      <Button
        className={cn(
          "min-h-12 rounded-full text-base",
          compact ? "w-full" : "w-full sm:w-auto sm:min-w-[10rem]",
        )}
        onClick={submit}
        disabled={saving || teamsLoading}
      >
        {saving ? "처리 중" : intent === "start" ? "시작" : "만들기"}
      </Button>
    </div>
  );
}
