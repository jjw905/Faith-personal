"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useLocalParticipant,
  useParticipants,
  useRoomContext,
} from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
import { LoaderCircle, LogOut, Mic, MicOff, PhoneOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  PersonAvatar,
  displayPersonName,
} from "@/components/people/person-avatar";
import { CorrectionHint } from "@/components/meetings/correction-hint";
import { Button } from "@/components/ui/button";
import { useRealtimeTranscription } from "@/hooks/use-realtime-transcription";

type Connection = {
  token: string;
  url: string;
  isHost: boolean;
  recordingActive?: boolean;
  micDefaults?: { microphoneOn?: boolean };
};

type Meeting = {
  id: string;
  title: string;
  ownerId: string;
  maxParticipants: number;
  state: string;
  recordingActive: boolean;
  participants: Array<{
    userId: string;
    name: string | null;
    handle: string | null;
    image: string | null;
  }>;
  pendingInvites: Array<{
    inviteId: string;
    userId: string;
    name: string | null;
    handle: string | null;
    image: string | null;
  }>;
};

type LiveLine = {
  key: string;
  speaker: string;
  text: string;
  corrections?: Array<{
    wrong: string;
    suggestion: string;
    reason?: string;
  }>;
};

export function PersonalVoiceRoom({ meetingId }: { meetingId: string }) {
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [micOn, setMicOn] = useState(false);
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/personal-realtime/meetings/${meetingId}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          ok?: boolean;
          meeting?: Meeting;
          isOwner?: boolean;
          message?: string;
        };
        if (!active) return;
        if (!response.ok || !data.ok || !data.meeting) {
          setError(data.message ?? "개인 실시간 회의를 불러오지 못했습니다.");
          return;
        }
        setMeeting(data.meeting);
        setIsOwner(Boolean(data.isOwner));
      })
      .catch(() => {
        if (active) setError("개인 실시간 회의를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [meetingId]);

  async function joinRoom() {
    setJoining(true);
    setError("");
    try {
      const response = await fetch("/api/livekit/personal-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personalMeetingId: meetingId }),
      });
      const data = (await response.json()) as Connection & {
        ok?: boolean;
        message?: string;
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? "음성 통화에 입장하지 못했습니다.");
      }
      setMicOn(Boolean(data.micDefaults?.microphoneOn));
      setConnection(data);
      setMeeting((current) =>
        current
          ? {
              ...current,
              recordingActive: Boolean(data.recordingActive),
            }
          : current,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "음성 통화에 입장하지 못했습니다.",
      );
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-72 place-items-center rounded-3xl bg-card shadow-soft">
        <LoaderCircle
          className="h-7 w-7 animate-spin text-muted"
          aria-label="불러오는 중"
        />
      </div>
    );
  }
  if (error && !meeting) {
    return (
      <div className="rounded-3xl bg-card p-6 text-base text-foreground shadow-soft">
        <p role="alert">{error}</p>
      </div>
    );
  }
  if (!meeting) return null;

  if (!connection) {
    return (
      <section className="mx-auto w-full max-w-2xl rounded-3xl bg-card p-5 shadow-soft sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex min-h-10 items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            개인 공동 기록
          </span>
          <span className="inline-flex min-h-10 items-center rounded-full bg-surface px-3 text-sm font-semibold text-muted">
            본인 포함 {meeting.maxParticipants}명
          </span>
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">
          {meeting.title}
        </h1>
        <p className="mt-2 text-base leading-7 text-muted">
          초대한 회원과 음성 통화에 참여합니다. 기록을 시작하면 호스트의 잔여
          시간에서 실제 회의 시간만 한 번 사용됩니다.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          {meeting.participants.map((participant) => {
            const name = displayPersonName(
              participant.name,
              participant.handle,
            );
            return (
              <span
                key={participant.userId}
                className="inline-flex min-h-12 items-center gap-2 rounded-full border border-border bg-surface py-1.5 pl-1.5 pr-3 text-base font-medium"
              >
                <PersonAvatar name={name} size="sm" />
                <span className="max-w-[10rem] truncate">{name}</span>
              </span>
            );
          })}
        </div>
        {isOwner && meeting.pendingInvites.length > 0 ? (
          <p className="mt-4 text-base text-muted">
            아직 응답하지 않은 초대 {meeting.pendingInvites.length}명
          </p>
        ) : null}
        {error ? (
          <p className="mt-4 text-base text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          className="mt-6 min-h-12 w-full rounded-full text-base"
          onClick={() => void joinRoom()}
          disabled={joining}
        >
          {joining ? "입장 중" : "음성 통화 입장"}
        </Button>
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
    >
      <PersonalVoiceRoomBody
        meetingId={meetingId}
        title={meeting.title}
        isHost={connection.isHost}
        initialRecordingActive={Boolean(connection.recordingActive)}
        onMicChange={setMicOn}
        onMeetingChange={(patch) =>
          setMeeting((current) => (current ? { ...current, ...patch } : current))
        }
      />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

function PersonalVoiceRoomBody({
  meetingId,
  title,
  isHost,
  initialRecordingActive,
  onMicChange,
  onMeetingChange,
}: {
  meetingId: string;
  title: string;
  isHost: boolean;
  initialRecordingActive: boolean;
  onMicChange: (value: boolean) => void;
  onMeetingChange: (patch: Partial<Meeting>) => void;
}) {
  const room = useRoomContext();
  const participants = useParticipants();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const [busy, setBusy] = useState(false);
  const [recordingActive, setRecordingActive] = useState(
    initialRecordingActive,
  );
  const [note, setNote] = useState("");
  const [liveLines, setLiveLines] = useState<LiveLine[]>([]);
  const sharedUtterancesRef = useRef(new Map<string, string>());
  const {
    status,
    utterances,
    partialText,
    error,
    meetingHref,
    start,
    stop,
  } = useRealtimeTranscription();

  function upsertLine(line: LiveLine) {
    setLiveLines((current) => {
      const index = current.findIndex((row) => row.key === line.key);
      if (index < 0) return [...current, line];
      const next = [...current];
      next[index] = line;
      return next;
    });
  }

  const publish = useCallback(
    async (message: unknown) => {
      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(message)),
        { reliable: true, topic: "faith-personal-stt" },
      );
    },
    [room],
  );

  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      participant?: { identity: string; name?: string },
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== "faith-personal-stt") return;
      let message: {
        type?: string;
        active?: boolean;
        itemId?: string;
        speaker?: string;
        text?: string;
        corrections?: LiveLine["corrections"];
      };
      try {
        message = JSON.parse(
          new TextDecoder().decode(payload),
        ) as typeof message;
      } catch {
        return;
      }
      if (message.type === "recording") {
        setRecordingActive(Boolean(message.active));
        if (!message.active) void stop();
        return;
      }
      if (
        message.type === "transcript" &&
        participant &&
        message.itemId &&
        message.text
      ) {
        upsertLine({
          key: `${participant.identity}:${message.itemId}`,
          speaker: message.speaker || participant.name || "참가자",
          text: message.text,
          corrections: message.corrections,
        });
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, stop]);

  useEffect(() => {
    if (
      !recordingActive ||
      !isMicrophoneEnabled ||
      (status !== "idle" && status !== "completed")
    ) {
      return;
    }
    const track = localParticipant.getTrackPublication(
      Track.Source.Microphone,
    )?.track?.mediaStreamTrack;
    if (!track) return;
    void start({
      title,
      personalMeetingId: meetingId,
      mediaStreamTrack: track,
    });
  }, [
    isMicrophoneEnabled,
    localParticipant,
    meetingId,
    recordingActive,
    start,
    status,
    title,
  ]);

  useEffect(() => {
    if (
      !isMicrophoneEnabled &&
      (status === "recording" || status === "connecting")
    ) {
      void stop();
    }
  }, [isMicrophoneEnabled, status, stop]);

  useEffect(() => {
    const speaker = displayPersonName(
      localParticipant.name,
      localParticipant.identity,
    );
    for (const utterance of utterances) {
      const signature = JSON.stringify([
        utterance.text,
        utterance.corrections ?? [],
      ]);
      if (sharedUtterancesRef.current.get(utterance.itemId) === signature) {
        continue;
      }
      sharedUtterancesRef.current.set(utterance.itemId, signature);
      upsertLine({
        key: `${localParticipant.identity}:${utterance.itemId}`,
        speaker,
        text: utterance.text,
        corrections: utterance.corrections?.map((correction) => ({
          wrong: correction.wrong,
          suggestion: correction.suggestion,
          reason: correction.reason,
        })),
      });
      void publish({
        type: "transcript",
        itemId: utterance.itemId,
        speaker,
        text: utterance.text,
        corrections: utterance.corrections,
      });
    }
  }, [
    localParticipant.identity,
    localParticipant.name,
    publish,
    utterances,
  ]);

  async function toggleMicrophone() {
    setBusy(true);
    await localParticipant
      .setMicrophoneEnabled(!isMicrophoneEnabled)
      .then(() => onMicChange(!isMicrophoneEnabled))
      .finally(() => setBusy(false));
  }

  async function toggleRecording() {
    if (!isHost) return;
    setBusy(true);
    setNote("");
    const action = recordingActive ? "stop" : "start";
    if (action === "start" && !isMicrophoneEnabled) {
      setNote("마이크를 켠 뒤 기록을 시작해 주세요.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch(
        `/api/personal-realtime/meetings/${meetingId}/recording`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      const data = (await response.json()) as {
        ok?: boolean;
        recordingActive?: boolean;
        message?: string;
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.message ?? "개인 기록 상태를 바꾸지 못했습니다.");
      }
      const active = Boolean(data.recordingActive);
      setRecordingActive(active);
      onMeetingChange({ recordingActive: active });
      await publish({ type: "recording", active });
      if (!active) {
        await stop({ finalizePersonal: true });
      }
    } catch (caught) {
      setNote(
        caught instanceof Error
          ? caught.message
          : "개인 기록 상태를 바꾸지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  const visibleError = note || error;
  return (
    <section className="flex min-h-[calc(100dvh-9rem)] flex-col rounded-3xl bg-card p-4 shadow-soft sm:p-6">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold text-foreground">
              {title}
            </h1>
            <span className="inline-flex min-h-10 items-center rounded-full bg-primary-soft px-3 text-sm font-semibold text-primary">
              개인 공동 기록
            </span>
          </div>
          <p className="mt-2 text-base text-muted">
            호스트의 잔여 시간에서 회의 시간만 한 번 사용됩니다.
          </p>
        </div>
        <span className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-primary-soft px-3 text-sm font-semibold">
          {participants.length}명
        </span>
      </header>

      {visibleError ? (
        <p className="mt-4 rounded-xl bg-warning-soft px-3 py-2 text-base text-foreground" role="alert">
          {visibleError}
        </p>
      ) : null}
      {meetingHref && !recordingActive ? (
        <a
          href={meetingHref}
          className="mt-3 inline-flex min-h-12 self-end items-center rounded-xl px-3 text-base font-semibold text-primary hover:bg-primary-soft"
        >
          기록 보기
        </a>
      ) : null}

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
                <CorrectionHint corrections={line.corrections} className="mt-2" />
              ) : null}
            </div>
          ))}
          {partialText ? (
            <div className="rounded-2xl bg-card px-4 py-3">
              <p className="text-base leading-relaxed text-muted">{partialText}</p>
            </div>
          ) : null}
        </section>
      )}

      <div className="grid flex-1 content-center gap-3 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {participants.map((participant) => {
          const name = displayPersonName(
            participant.name,
            participant.identity,
          );
          return (
            <div
              key={participant.identity}
              className="flex min-h-36 flex-col items-center justify-center rounded-3xl bg-surface p-5"
            >
              <PersonAvatar name={name} size="lg" />
              <p className="mt-3 max-w-full truncate text-lg font-semibold">
                {name}
              </p>
              <p className="mt-1 text-sm text-muted">
                {participant.isMicrophoneEnabled ? "마이크 켜짐" : "음소거"}
              </p>
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
        {isHost ? (
          <Button
            type="button"
            variant="destructive"
            className="h-14 rounded-full px-5"
            onClick={() => void toggleRecording()}
            disabled={busy || !recordingActive}
            aria-label="회의 종료"
          >
            <PhoneOff className="h-5 w-5" />
            종료
          </Button>
        ) : null}
      </footer>
    </section>
  );
}
