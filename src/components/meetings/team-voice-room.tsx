"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from "@livekit/components-react";
import {
  LoaderCircle,
  LogOut,
  Mic,
  MicOff,
  PhoneOff,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  PersonAvatar,
  displayPersonName,
} from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

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
          team?: { policy?: { forceMicrophoneOff?: boolean } };
        };
        derived?: { phase?: MeetingPhase };
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
      if (!meetingRes.ok || !meetingJson.ok) {
        setError(meetingJson.message ?? "회의 정보를 불러오지 못했습니다.");
        return;
      }
      const forcedOff = Boolean(
        meetingJson.meeting?.team?.policy?.forceMicrophoneOff,
      );
      setMicOn(
        forcedOff ? false : Boolean(settingsJson.settings?.defaultMicrophoneOn),
      );
      setDeviceId(settingsJson.settings?.preferredInputDeviceId ?? "");
      setRecordingActive(Boolean(meetingJson.meeting?.recordingActive));
      if (meetingJson.derived?.phase) {
        setPhase(meetingJson.derived.phase);
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

  async function joinRoom() {
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

  if (error && !connection) {
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
        <div className="mt-6 space-y-4">
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
            disabled={joining}
            onClick={() => void joinRoom()}
          >
            {joining ? "입장 중" : "입장"}
          </Button>
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
    const response = await fetch(`/api/team-meetings/${meetingId}/recording`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: recordingActive ? "stop" : "start" }),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      recordingActive?: boolean;
      message?: string;
      code?: string;
    };
    if (response.ok && data.ok) {
      onRecordingChange(Boolean(data.recordingActive));
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
          {recordingNote ? (
            <p className="mt-2 max-w-md text-sm text-muted">{recordingNote}</p>
          ) : null}
        </div>
        <span className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary-soft px-3 text-sm font-semibold">
          <UsersRound className="h-4 w-4" aria-hidden />
          {participants.length}
        </span>
      </header>

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
