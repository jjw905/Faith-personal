"use client";

import Link from "next/link";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import {
  LoaderCircle,
  LogOut,
  Mic,
  MicOff,
  PhoneOff,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CorrectionHint } from "@/components/meetings/correction-hint";
import {
  PersonAvatar,
  displayPersonName,
} from "@/components/people/person-avatar";
import {
  ParticipantChipPicker,
  type ParticipantOption,
} from "@/components/team/participant-chip-picker";
import { Button } from "@/components/ui/button";
import { useRealtimeTranscription } from "@/hooks/use-realtime-transcription";
import { cn } from "@/lib/utils";
import type { TranscriptCorrection } from "@/types/transcript";

type TokenPayload = {
  token: string;
  url: string;
  isHost: boolean;
  recordingActive?: boolean;
};

type MeetingPhase =
  | "canceled"
  | "ended"
  | "scheduled"
  | "join_open"
  | "in_progress"
  | "host_absence_warn"
  | "host_absence_close";

type PrejoinInvitee = {
  userId: string;
  name: string | null;
  handle: string | null;
};

export function TeamVoiceRoom({
  teamMeetingId,
  title,
  initialPhase,
}: {
  teamMeetingId: string;
  title: string;
  initialPhase?: MeetingPhase;
}) {
  const [connection, setConnection] = useState<TokenPayload | null>(null);
  const [error, setError] = useState("");
  const [prejoinReady, setPrejoinReady] = useState(false);
  const [joining, setJoining] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [level, setLevel] = useState(0);
  const [recordingActive, setRecordingActive] = useState(false);
  const [phase, setPhase] = useState<MeetingPhase | undefined>(initialPhase);
  const [canReplaceParticipants, setCanReplaceParticipants] = useState(false);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [organizerId, setOrganizerId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<ParticipantOption[]>([]);
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [invitees, setInvitees] = useState<PrejoinInvitee[]>([]);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteNote, setInviteNote] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const inviteSaveSeqRef = useRef(0);
  const participantIdsRef = useRef<string[]>([]);
  participantIdsRef.current = participantIds;

  useEffect(() => {
    let active = true;
    async function loadDefaults() {
      const [meetingRes, settingsRes] = await Promise.all([
        fetch(`/api/team-meetings/${teamMeetingId}`, { cache: "no-store" }),
        fetch("/api/personal-settings", { cache: "no-store" }),
      ]);
      const meetingJson = (await meetingRes.json()) as {
        ok?: boolean;
        meeting?: {
          recordingActive?: boolean;
          organizerId?: string;
          teamId?: string;
          team?: {
            id?: string;
            policy?: { forceMicrophoneOff?: boolean };
          };
          access?: Array<{
            userId: string;
            isParticipant?: boolean;
            user?: {
              id?: string;
              name: string | null;
              handle: string | null;
            };
          }>;
        };
        derived?: {
          phase?: MeetingPhase;
          canReplaceParticipants?: boolean;
        };
        message?: string;
      };
      const settingsJson = (await settingsRes.json()) as {
        ok?: boolean;
        settings?: {
          defaultMicrophoneOn?: boolean;
          preferredInputDeviceId?: string | null;
        };
      };
      if (!active) return;
      if (!meetingRes.ok || !meetingJson.ok || !meetingJson.meeting) {
        setError(meetingJson.message ?? "회의 정보를 불러오지 못했습니다.");
        return;
      }
      const meeting = meetingJson.meeting;
      const forcedOff = Boolean(meeting.team?.policy?.forceMicrophoneOff);
      setMicOn(
        forcedOff ? false : Boolean(settingsJson.settings?.defaultMicrophoneOn),
      );
      setDeviceId(settingsJson.settings?.preferredInputDeviceId ?? "");
      setRecordingActive(Boolean(meeting.recordingActive));
      if (meetingJson.derived?.phase) {
        setPhase(meetingJson.derived.phase);
      }
      setCanReplaceParticipants(
        Boolean(meetingJson.derived?.canReplaceParticipants),
      );
      setOrganizerId(meeting.organizerId ?? null);

      const participantRows = (meeting.access ?? []).filter(
        (row) => row.isParticipant,
      );
      const selected = participantRows
        .map((row) => row.userId)
        .filter((id) => id !== meeting.organizerId);
      setParticipantIds(selected);
      setInvitees(
        participantRows
          .filter((row) => row.userId !== meeting.organizerId)
          .map((row) => ({
            userId: row.userId,
            name: row.user?.name ?? null,
            handle: row.user?.handle ?? null,
          })),
      );

      const teamId = meeting.teamId ?? meeting.team?.id;
      if (teamId) {
        const teamRes = await fetch(`/api/teams/${teamId}`, {
          cache: "no-store",
        });
        const teamJson = (await teamRes.json()) as {
          ok?: boolean;
          members?: ParticipantOption[];
          currentMember?: { userId: string };
        };
        if (!active) return;
        const me = teamJson.currentMember?.userId;
        setIsOrganizer(Boolean(me && me === meeting.organizerId));
        setTeamMembers(
          (teamJson.members ?? []).filter((member) => member.userId !== me),
        );
      }
      setPrejoinReady(true);
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (active) {
          setDevices(list.filter((device) => device.kind === "audioinput"));
        }
      } catch {
        // ignore until permission
      }
    }
    void loadDefaults();
    return () => {
      active = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [teamMeetingId]);

  useEffect(() => {
    if (connection || !micOn) {
      if (!micOn) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        queueMicrotask(() => setLevel(0));
      }
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId } : true,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = stream;
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          analyser.getByteFrequencyData(data);
          const avg =
            data.reduce((sum, value) => sum + value, 0) /
            Math.max(data.length, 1);
          setLevel(Math.min(100, Math.round((avg / 140) * 100)));
          rafRef.current = requestAnimationFrame(tick);
        };
        tick();
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(list.filter((device) => device.kind === "audioinput"));
      } catch {
        setMicOn(false);
      }
    })();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setLevel(0);
    };
  }, [connection, deviceId, micOn]);

  async function saveInvitees(nextIds: string[]) {
    if (!canReplaceParticipants || !isOrganizer || !organizerId) return;
    const previous = participantIdsRef.current;
    if (nextIds.length === 0) {
      setInviteNote("함께할 팀원을 한 명 이상 선택해 주세요.");
      return;
    }
    const seq = ++inviteSaveSeqRef.current;
    setParticipantIds(nextIds);
    setInviteSaving(true);
    setInviteNote("");
    try {
      const response = await fetch(`/api/team-meetings/${teamMeetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantIds: [...nextIds, organizerId],
        }),
      });
      const data = (await response.json()) as { ok?: boolean; message?: string };
      if (seq !== inviteSaveSeqRef.current) return;
      if (!response.ok || !data.ok) {
        setParticipantIds(previous);
        setInviteNote(data.message ?? "초대를 저장하지 못했습니다.");
        return;
      }
      setInvitees(
        teamMembers
          .filter((member) => nextIds.includes(member.userId))
          .map((member) => ({
            userId: member.userId,
            name: member.user.name,
            handle: member.user.handle,
          })),
      );
    } catch {
      if (seq !== inviteSaveSeqRef.current) return;
      setParticipantIds(previous);
      setInviteNote("초대를 저장하지 못했습니다.");
    } finally {
      if (seq === inviteSaveSeqRef.current) {
        setInviteSaving(false);
      }
    }
  }

  const needsInviteBeforeJoin =
    isOrganizer && canReplaceParticipants && participantIds.length === 0;

  async function joinRoom() {
    if (needsInviteBeforeJoin) {
      setError("함께할 팀원을 초대한 뒤 입장해 주세요.");
      return;
    }
    setJoining(true);
    setError("");
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const response = await fetch("/api/livekit/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamMeetingId }),
    });
    const data = (await response.json()) as TokenPayload & {
      ok?: boolean;
      message?: string;
      recordingActive?: boolean;
    };
    setJoining(false);
    if (!response.ok || !data.ok) {
      setError(data.message ?? "음성 회의에 연결하지 못했습니다.");
      return;
    }
    setRecordingActive(Boolean(data.recordingActive));
    setConnection(data);
  }

  if (error && !connection && !prejoinReady) {
    return (
      <div className="rounded-2xl bg-card p-6 text-base text-foreground shadow-soft">
        {error}
      </div>
    );
  }
  if (!prejoinReady) {
    return (
      <div className="grid min-h-72 place-items-center rounded-2xl bg-card shadow-soft">
        <LoaderCircle
          className="h-7 w-7 animate-spin text-muted"
          aria-label="불러오는 중"
        />
      </div>
    );
  }

  if (!connection) {
    const waiting = phase === "join_open" || phase === "host_absence_warn";
    const canEditInvite = isOrganizer && canReplaceParticipants;
    return (
      <section className="rounded-2xl bg-card p-5 shadow-soft sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          {waiting ? (
            <span className="inline-flex min-h-10 items-center rounded-full bg-surface px-3 text-sm font-semibold text-muted">
              대기
            </span>
          ) : null}
          <span className="inline-flex min-h-10 items-center rounded-full bg-surface px-3 text-sm font-semibold text-muted">
            {recordingActive ? "기록 중" : "기록 전"}
          </span>
        </div>
        <h1 className="mt-3 text-xl font-semibold">{title}</h1>
        {waiting ? (
          <p className="mt-2 text-base text-muted">
            음성은 사용할 수 있습니다. 기록은 시작 전이면 꺼져 있습니다.
          </p>
        ) : null}

        <div className="mt-6 space-y-5">
          {canEditInvite ? (
            <ParticipantChipPicker
              members={teamMembers}
              selectedIds={participantIds}
              required
              disabled={inviteSaving}
              onChange={(ids) => {
                void saveInvitees(ids);
              }}
            />
          ) : invitees.length > 0 ? (
            <div>
              <p className="text-base font-medium">초대된 팀원</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {invitees.map((person) => {
                  const name = displayPersonName(person.name, person.handle);
                  return (
                    <span
                      key={person.userId}
                      className="inline-flex min-h-12 items-center gap-2 rounded-full border border-border bg-surface py-1.5 pl-1.5 pr-3 text-base font-medium"
                    >
                      <PersonAvatar
                        name={name}
                        size="sm"
                        className="border-transparent"
                      />
                      <span className="max-w-[8rem] truncate">{name}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}
          {inviteNote ? (
            <p className="text-base text-muted" role="status">
              {inviteNote}
            </p>
          ) : null}

          <div className="flex min-h-14 items-center justify-between gap-4">
            <span className="text-base font-medium">마이크</span>
            <Button
              type="button"
              size="icon"
              variant={micOn ? "secondary" : "default"}
              className="h-12 w-12 rounded-full"
              aria-label={micOn ? "마이크 끄기" : "마이크 켜기"}
              aria-pressed={micOn}
              onClick={() => setMicOn((value) => !value)}
            >
              {micOn ? (
                <Mic className="h-5 w-5" />
              ) : (
                <MicOff className="h-5 w-5" />
              )}
            </Button>
          </div>
          <label className="block text-base font-medium">
            입력 장치
            <select
              className="mt-2 min-h-12 w-full rounded-2xl border border-border bg-card px-4 text-base"
              value={deviceId}
              onChange={(event) => setDeviceId(event.target.value)}
            >
              <option value="">기본 장치</option>
              {devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || "마이크"}
                </option>
              ))}
            </select>
          </label>
          <div>
            <p className="text-base font-medium" id="mic-level-label">
              입력 레벨
            </p>
            <div
              className="mt-2 h-3 overflow-hidden rounded-full bg-surface"
              role="meter"
              aria-labelledby="mic-level-label"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={micOn ? level : 0}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-150 motion-reduce:transition-none"
                style={{ width: `${micOn ? level : 0}%` }}
              />
            </div>
          </div>
          {error ? <p className="text-base text-muted">{error}</p> : null}
          <Button
            className="min-h-12 w-full rounded-full"
            disabled={joining || inviteSaving || needsInviteBeforeJoin}
            onClick={() => void joinRoom()}
          >
            {joining
              ? "입장 중"
              : needsInviteBeforeJoin
                ? "팀원 선택 후 입장"
                : "입장"}
          </Button>
          {isOrganizer && canReplaceParticipants ? (
            <Button
              asChild
              variant="ghost"
              className="min-h-12 w-full rounded-full"
            >
              <Link href="/team">돌아가기</Link>
            </Button>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <LiveKitRoom
      token={connection.token}
      serverUrl={connection.url}
      connect
      audio={micOn}
      video={false}
      className="contents"
      options={{
        audioCaptureDefaults: deviceId ? { deviceId } : undefined,
      }}
    >
      <VoiceRoomBody
        meetingId={teamMeetingId}
        title={title}
        isHost={connection.isHost}
        recordingActive={recordingActive}
        onRecordingChange={setRecordingActive}
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

type TeamLiveTranscriptLine = {
  key: string;
  speaker: string;
  text: string;
  corrections?: TranscriptCorrection[];
};

type TeamDataMessage =
  | { type: "recording"; active: boolean }
  | {
      type: "transcript";
      itemId: string;
      speaker: string;
      text: string;
      corrections?: TranscriptCorrection[];
    };

function VoiceRoomBody({
  meetingId,
  title,
  isHost,
  recordingActive,
  onRecordingChange,
}: {
  meetingId: string;
  title: string;
  isHost: boolean;
  recordingActive: boolean;
  onRecordingChange: (value: boolean) => void;
}) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [busy, setBusy] = useState(false);
  const [recordingNote, setRecordingNote] = useState<string | null>(null);
  const [liveLines, setLiveLines] = useState<TeamLiveTranscriptLine[]>([]);
  const {
    status: realtimeStatus,
    utterances: realtimeUtterances,
    partialText,
    error: realtimeError,
    meetingHref,
    start: startRealtime,
    stop: stopRealtime,
  } = useRealtimeTranscription();
  const sharedUtterancesRef = useRef(new Map<string, string>());

  const localMicrophoneTrack = useCallback((): MediaStreamTrack | undefined => {
    return localParticipant.getTrackPublication(Track.Source.Microphone)?.track
      ?.mediaStreamTrack;
  }, [localParticipant]);

  const upsertLiveLine = useCallback((line: TeamLiveTranscriptLine) => {
    setLiveLines((current) => {
      const index = current.findIndex((row) => row.key === line.key);
      if (index < 0) return [...current, line];
      const next = [...current];
      next[index] = line;
      return next;
    });
  }, []);

  const publishTeamMessage = useCallback(
    async (
      message: TeamDataMessage,
      topic: "faith-control" | "faith-stt",
    ) => {
      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(message)),
        { reliable: true, topic },
      );
    },
    [room.localParticipant],
  );
  const visibleRecordingNote = recordingNote ?? realtimeError;

  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      participant?: { identity: string },
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== "faith-control" && topic !== "faith-stt") return;
      let message: TeamDataMessage;
      try {
        message = JSON.parse(
          new TextDecoder().decode(payload),
        ) as TeamDataMessage;
      } catch {
        return;
      }
      if (message.type === "recording") {
        onRecordingChange(message.active);
        if (!message.active) void stopRealtime();
        return;
      }
      if (message.type === "transcript" && participant) {
        upsertLiveLine({
          key: `${participant.identity}:${message.itemId}`,
          speaker: message.speaker,
          text: message.text,
          corrections: message.corrections,
        });
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [onRecordingChange, room, stopRealtime, upsertLiveLine]);

  useEffect(() => {
    if (
      !recordingActive ||
      !isMicrophoneEnabled ||
      (realtimeStatus !== "idle" && realtimeStatus !== "completed")
    ) {
      return;
    }
    const track = localMicrophoneTrack();
    if (!track) return;
    void startRealtime({
      title,
      teamMeetingId: meetingId,
      mediaStreamTrack: track,
    });
  }, [
    isMicrophoneEnabled,
    localMicrophoneTrack,
    meetingId,
    recordingActive,
    realtimeStatus,
    startRealtime,
    title,
  ]);

  useEffect(() => {
    if (
      recordingActive &&
      !isMicrophoneEnabled &&
      (realtimeStatus === "recording" || realtimeStatus === "connecting")
    ) {
      void stopRealtime();
    }
  }, [
    isMicrophoneEnabled,
    recordingActive,
    realtimeStatus,
    stopRealtime,
  ]);

  useEffect(() => {
    const speaker = displayPersonName(
      localParticipant.name,
      localParticipant.identity,
    );
    for (const utterance of realtimeUtterances) {
      const signature = JSON.stringify([
        utterance.text,
        utterance.corrections ?? [],
      ]);
      if (sharedUtterancesRef.current.get(utterance.itemId) === signature) {
        continue;
      }
      sharedUtterancesRef.current.set(utterance.itemId, signature);
      upsertLiveLine({
        key: `${localParticipant.identity}:${utterance.itemId}`,
        speaker,
        text: utterance.text,
        corrections: utterance.corrections,
      });
      void publishTeamMessage(
        {
          type: "transcript",
          itemId: utterance.itemId,
          speaker,
          text: utterance.text,
          corrections: utterance.corrections,
        },
        "faith-stt",
      );
    }
  }, [
    localParticipant.identity,
    localParticipant.name,
    publishTeamMessage,
    realtimeUtterances,
    upsertLiveLine,
  ]);

  async function toggleMicrophone() {
    setBusy(true);
    await localParticipant
      .setMicrophoneEnabled(!isMicrophoneEnabled)
      .finally(() => setBusy(false));
  }

  async function toggleRecording() {
    if (!isHost) return;
    setBusy(true);
    setRecordingNote(null);
    const action = recordingActive ? "stop" : "start";
    if (action === "start" && !isMicrophoneEnabled) {
      setRecordingNote("마이크를 켠 뒤 기록을 시작해 주세요.");
      setBusy(false);
      return;
    }
    const response = await fetch(`/api/team-meetings/${meetingId}/recording`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      recordingActive?: boolean;
      message?: string;
      code?: string;
    };
    if (response.ok && data.ok) {
      const active = Boolean(data.recordingActive);
      onRecordingChange(active);
      if (active) {
        await publishTeamMessage(
          { type: "recording", active: true },
          "faith-control",
        );
        const track = localMicrophoneTrack();
        if (track) {
          const started = await startRealtime({
            title,
            teamMeetingId: meetingId,
            mediaStreamTrack: track,
          });
          if (!started) {
            setRecordingNote(
              "내 마이크 받아쓰기를 시작하지 못했습니다. 다른 참가자 기록은 계속됩니다.",
            );
          }
        }
      } else {
        await publishTeamMessage(
          { type: "recording", active: false },
          "faith-control",
        );
        await stopRealtime();
        const completeResponse = await fetch(
          `/api/stt/realtime/team/${meetingId}/complete`,
          { method: "POST" },
        );
        const completeData = (await completeResponse.json()) as {
          ok?: boolean;
          message?: string;
        };
        if (!completeResponse.ok || !completeData.ok) {
          setRecordingNote(
            completeData.message ?? "팀 기록을 완료하지 못했습니다.",
          );
        }
      }
    } else {
      onRecordingChange(false);
      if (data.code === "LIVE_STT_UNAVAILABLE" || response.status === 503) {
        setRecordingNote(
          data.message ??
            "실시간 기록이 아직 연결되지 않았습니다. 음성 통화는 계속 사용할 수 있습니다.",
        );
      } else if (data.message) {
        setRecordingNote(data.message);
      }
    }
    setBusy(false);
  }

  async function endMeeting() {
    setBusy(true);
    const response = await fetch(`/api/team-meetings/${meetingId}/room`, {
      method: "DELETE",
    });
    if (response.ok) room.disconnect();
    setBusy(false);
  }

  async function removeParticipant(userId: string) {
    setBusy(true);
    await fetch(`/api/team-meetings/${meetingId}/room`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    setBusy(false);
  }

  return (
    <section className="flex min-h-[calc(100dvh-9rem)] flex-col rounded-2xl bg-card p-4 shadow-soft sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <p
            className={cn(
              "mt-2 inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold",
              recordingActive
                ? "bg-primary text-primary-foreground"
                : "bg-surface text-muted",
            )}
          >
            {recordingActive ? "기록 중" : "기록 전"}
          </p>
          {visibleRecordingNote ? (
            <p className="mt-2 max-w-md text-base text-muted">
              {visibleRecordingNote}
            </p>
          ) : null}
          {meetingHref && !recordingActive ? (
            <Link
              href={meetingHref}
              className="mt-2 inline-flex min-h-12 items-center rounded-xl px-3 text-base font-semibold text-primary hover:bg-primary-soft"
            >
              기록 보기
            </Link>
          ) : null}
        </div>
        <span className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary-soft px-3 text-sm font-semibold">
          <UsersRound className="h-4 w-4" aria-hidden />
          {participants.length}
        </span>
      </header>

      {(liveLines.length > 0 || partialText) && (
        <section
          aria-label="실시간 대화기록"
          aria-live="polite"
          className="mt-5 max-h-72 space-y-3 overflow-y-auto rounded-3xl bg-surface p-4"
        >
          {liveLines.slice(-8).map((line) => (
            <div key={line.key} className="rounded-2xl bg-card px-4 py-3">
              <p className="text-base font-semibold text-foreground">
                {line.speaker}
              </p>
              <p className="mt-1 text-base leading-relaxed text-foreground">
                {line.text}
              </p>
              {line.corrections?.length ? (
                <CorrectionHint
                  corrections={line.corrections}
                  className="mt-2"
                />
              ) : null}
            </div>
          ))}
          {partialText ? (
            <div className="rounded-2xl bg-card px-4 py-3">
              <p className="text-base leading-relaxed text-muted">
                {partialText}
              </p>
            </div>
          ) : null}
        </section>
      )}

      <div className="grid flex-1 content-center gap-3 py-8 sm:grid-cols-2 lg:grid-cols-3">
        {participants.map((participant) => {
          const name = displayPersonName(
            participant.name,
            participant.identity,
          );
          return (
            <div
              key={participant.identity}
              className={cn(
                "flex min-h-36 flex-col items-center justify-center rounded-3xl bg-surface p-5 transition-colors duration-150 motion-reduce:transition-none",
                participant.isSpeaking
                  ? "ring-2 ring-primary"
                  : "ring-0 ring-transparent",
              )}
            >
              <PersonAvatar name={name} size="lg" />
              <p className="mt-3 max-w-full truncate text-lg font-semibold">
                {name}
              </p>
              <p
                className="mt-1"
                aria-label={
                  participant.isMicrophoneEnabled ? "마이크 켜짐" : "음소거"
                }
              >
                {participant.isMicrophoneEnabled ? (
                  <Mic className="h-4 w-4 text-muted" aria-hidden />
                ) : (
                  <MicOff className="h-4 w-4 text-muted" aria-hidden />
                )}
              </p>
              {isHost && participant.identity !== localParticipant.identity ? (
                <button
                  type="button"
                  className="mt-2 inline-flex min-h-12 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted hover:bg-card"
                  onClick={() => void removeParticipant(participant.identity)}
                  disabled={busy}
                  aria-label={`${name} 내보내기`}
                >
                  <UserRoundX className="h-4 w-4" />
                  내보내기
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <footer className="flex min-h-20 flex-wrap items-center justify-center gap-3 border-t border-border pt-4">
        <Button
          type="button"
          size="icon"
          variant={isMicrophoneEnabled ? "secondary" : "default"}
          className="h-14 w-14 rounded-full"
          onClick={() => void toggleMicrophone()}
          disabled={busy}
          aria-label={isMicrophoneEnabled ? "음소거" : "마이크 켜기"}
        >
          {isMicrophoneEnabled ? (
            <Mic className="h-6 w-6" />
          ) : (
            <MicOff className="h-6 w-6" />
          )}
        </Button>
        {isHost ? (
          <Button
            type="button"
            variant={recordingActive ? "default" : "secondary"}
            className="min-h-14 rounded-full px-5"
            onClick={() => void toggleRecording()}
            disabled={busy}
            aria-label={recordingActive ? "기록 중지" : "기록 시작"}
          >
            {recordingActive ? "기록 중지" : "기록 시작"}
          </Button>
        ) : null}
        {isHost ? (
          <Button
            type="button"
            variant="destructive"
            className="h-14 rounded-full px-5"
            onClick={() => void endMeeting()}
            disabled={busy}
            aria-label="회의 종료"
          >
            <PhoneOff className="h-5 w-5" />
            종료
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="h-14 rounded-full px-5"
            onClick={() => room.disconnect()}
            disabled={busy}
            aria-label="회의 나가기"
          >
            <LogOut className="h-5 w-5" />
            나가기
          </Button>
        )}
      </footer>
    </section>
  );
}
