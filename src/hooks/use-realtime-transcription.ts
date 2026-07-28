"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { TranscriptCorrection } from "@/types/transcript";

type LiveStatus =
  | "idle"
  | "connecting"
  | "recording"
  | "stopping"
  | "completed"
  | "error";

export type BrowserRealtimeUtterance = {
  itemId: string;
  sequence: number;
  text: string;
  startSec: number;
  endSec?: number;
  confidence?: number;
  corrections?: TranscriptCorrection[];
};

type StartOptions = {
  title: string;
  teamMeetingId?: string;
  mediaStreamTrack?: MediaStreamTrack;
};

type CompleteResult = {
  href?: string;
  meetingId?: string;
  finalized?: boolean;
};

const OPENAI_CALLS_ENDPOINT = "https://api.openai.com/v1/realtime/calls";

function eventConfidence(event: Record<string, unknown>): number | undefined {
  const logprobs = event.logprobs;
  if (!Array.isArray(logprobs) || logprobs.length === 0) return undefined;
  const values = logprobs
    .map((row) =>
      row && typeof row === "object"
        ? Number((row as Record<string, unknown>).logprob)
        : Number.NaN,
    )
    .filter(Number.isFinite);
  if (values.length === 0) return undefined;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.max(0, Math.min(1, Math.exp(mean)));
}

export function useRealtimeTranscription() {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [partialText, setPartialText] = useState("");
  const [utterances, setUtterances] = useState<BrowserRealtimeUtterance[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [meetingHref, setMeetingHref] = useState<string | null>(null);

  const statusRef = useRef<LiveStatus>("idle");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const tracksRef = useRef<MediaStreamTrack[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const startedAtRef = useRef(0);
  const sequenceRef = useRef(0);
  const lastEndSecRef = useRef(0);
  const windowsRef = useRef(
    new Map<string, { startSec: number; endSec?: number }>(),
  );
  const completedRef = useRef(new Set<string>());
  const pendingWritesRef = useRef(new Set<Promise<unknown>>());

  const setLiveStatus = useCallback((next: LiveStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const closeMedia = useCallback(() => {
    channelRef.current?.close();
    channelRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
    for (const track of tracksRef.current) track.stop();
    tracksRef.current = [];
  }, []);

  const persistUtterance = useCallback(
    (sessionId: string, utterance: BrowserRealtimeUtterance) => {
      const task = fetch(`/api/stt/realtime/${sessionId}/utterance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(utterance),
      })
        .then(async (response) => {
          const body = (await response.json()) as {
            ok?: boolean;
            corrections?: TranscriptCorrection[];
            message?: string;
          };
          if (!response.ok || !body.ok) {
            throw new Error(body.message ?? "실시간 발화를 저장하지 못했습니다.");
          }
          if (body.corrections?.length) {
            setUtterances((current) =>
              current.map((row) =>
                row.itemId === utterance.itemId
                  ? { ...row, corrections: body.corrections }
                  : row,
              ),
            );
          }
        })
        .catch((caught) => {
          setError(
            caught instanceof Error
              ? caught.message
              : "실시간 발화를 저장하지 못했습니다.",
          );
        })
        .finally(() => {
          pendingWritesRef.current.delete(task);
        });
      pendingWritesRef.current.add(task);
    },
    [],
  );

  const handleServerEvent = useCallback(
    (raw: string) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = String(event.type ?? "");
      if (type === "error") {
        const detail =
          event.error && typeof event.error === "object"
            ? String((event.error as Record<string, unknown>).message ?? "")
            : "";
        if (!/buffer.*empty|buffer_too_small|commit_empty/i.test(detail)) {
          setError(detail || "실시간 전사 연결에서 오류가 발생했습니다.");
        }
        return;
      }

      if (type === "input_audio_buffer.speech_started") {
        const itemId = String(event.item_id ?? "");
        const startMs = Number(event.audio_start_ms);
        if (itemId && Number.isFinite(startMs)) {
          windowsRef.current.set(itemId, {
            startSec: Math.max(0, startMs / 1000),
          });
        }
        return;
      }
      if (type === "input_audio_buffer.speech_stopped") {
        const itemId = String(event.item_id ?? "");
        const endMs = Number(event.audio_end_ms);
        const window = windowsRef.current.get(itemId);
        if (window && Number.isFinite(endMs)) {
          window.endSec = Math.max(window.startSec, endMs / 1000);
        }
        return;
      }

      if (
        type === "conversation.item.input_audio_transcription.delta" ||
        type === "conversation.item.audio_transcription.delta"
      ) {
        const delta = String(event.delta ?? "");
        if (delta) setPartialText((current) => current + delta);
        return;
      }

      if (
        type !== "conversation.item.input_audio_transcription.completed" &&
        type !== "conversation.item.audio_transcription.completed"
      ) {
        return;
      }

      const text = String(event.transcript ?? "").trim();
      const itemId = String(event.item_id ?? `utterance-${sequenceRef.current}`);
      if (!text || completedRef.current.has(itemId)) return;
      completedRef.current.add(itemId);

      const elapsedSec = Math.max(0, (Date.now() - startedAtRef.current) / 1000);
      const window = windowsRef.current.get(itemId) ?? {
        startSec: lastEndSecRef.current,
        endSec: elapsedSec,
      };
      const sequence = sequenceRef.current;
      sequenceRef.current += 1;
      const utterance: BrowserRealtimeUtterance = {
        itemId,
        sequence,
        text,
        startSec: window.startSec,
        endSec: window.endSec,
        confidence: eventConfidence(event),
      };
      lastEndSecRef.current = Math.max(
        lastEndSecRef.current,
        utterance.endSec ?? utterance.startSec,
      );
      setUtterances((current) => [...current, utterance]);
      setPartialText("");

      const sessionId = sessionIdRef.current;
      if (sessionId) persistUtterance(sessionId, utterance);
    },
    [persistUtterance],
  );

  const start = useCallback(
    async (options: StartOptions): Promise<boolean> => {
      if (
        statusRef.current === "connecting" ||
        statusRef.current === "recording"
      ) {
        return true;
      }

      setLiveStatus("connecting");
      setError(null);
      setMeetingHref(null);
      setPartialText("");
      setUtterances([]);
      sequenceRef.current = 0;
      lastEndSecRef.current = 0;
      windowsRef.current.clear();
      completedRef.current.clear();

      try {
        const tokenResponse = await fetch("/api/stt/realtime/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: options.title,
            teamMeetingId: options.teamMeetingId,
          }),
        });
        const tokenBody = (await tokenResponse.json()) as {
          ok?: boolean;
          sessionId?: string;
          clientSecret?: string;
          href?: string;
          message?: string;
        };
        if (
          !tokenResponse.ok ||
          !tokenBody.ok ||
          !tokenBody.sessionId ||
          !tokenBody.clientSecret
        ) {
          throw new Error(
            tokenBody.message ?? "실시간 기록을 시작하지 못했습니다.",
          );
        }
        sessionIdRef.current = tokenBody.sessionId;
        setMeetingHref(tokenBody.href ?? null);

        let sourceTrack = options.mediaStreamTrack;
        if (!sourceTrack) {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
          sourceTrack = stream.getAudioTracks()[0];
          for (const track of stream.getTracks()) tracksRef.current.push(track);
        }
        if (!sourceTrack) throw new Error("마이크를 찾을 수 없습니다.");

        const track =
          options.mediaStreamTrack && sourceTrack.clone
            ? sourceTrack.clone()
            : sourceTrack;
        if (track !== sourceTrack) tracksRef.current.push(track);

        const peer = new RTCPeerConnection();
        peerRef.current = peer;
        peer.addTrack(track, new MediaStream([track]));
        const channel = peer.createDataChannel("oai-events");
        channelRef.current = channel;
        channel.addEventListener("message", (message) =>
          handleServerEvent(String(message.data ?? "")),
        );
        channel.addEventListener("error", () => {
          setError("실시간 전사 채널 연결이 끊겼습니다.");
        });

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        const sdpResponse = await fetch(OPENAI_CALLS_ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenBody.clientSecret}`,
            "Content-Type": "application/sdp",
          },
          body: offer.sdp,
        });
        if (!sdpResponse.ok) {
          throw new Error("실시간 음성 연결을 열지 못했습니다.");
        }
        await peer.setRemoteDescription({
          type: "answer",
          sdp: await sdpResponse.text(),
        });

        startedAtRef.current = Date.now();
        setLiveStatus("recording");
        return true;
      } catch (caught) {
        closeMedia();
        setLiveStatus("error");
        setError(
          caught instanceof Error
            ? caught.message
            : "실시간 기록을 시작하지 못했습니다.",
        );
        return false;
      }
    },
    [closeMedia, handleServerEvent, setLiveStatus],
  );

  const stop = useCallback(
    async (options?: { finalizeTeam?: boolean }): Promise<CompleteResult> => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) return {};
      if (
        statusRef.current !== "recording" &&
        statusRef.current !== "connecting"
      ) {
        return {};
      }

      setLiveStatus("stopping");
      if (channelRef.current?.readyState === "open") {
        channelRef.current.send(
          JSON.stringify({ type: "input_audio_buffer.commit" }),
        );
        await new Promise((resolve) => setTimeout(resolve, 900));
      }
      closeMedia();
      await Promise.allSettled([...pendingWritesRef.current]);

      const durationSec = Math.max(
        0,
        (Date.now() - startedAtRef.current) / 1000,
      );
      try {
        const response = await fetch(
          `/api/stt/realtime/${sessionId}/complete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              durationSec,
              finalizeTeam: options?.finalizeTeam === true,
            }),
          },
        );
        const body = (await response.json()) as CompleteResult & {
          ok?: boolean;
          message?: string;
        };
        if (!response.ok || !body.ok) {
          throw new Error(body.message ?? "실시간 기록을 완료하지 못했습니다.");
        }
        if (body.href) setMeetingHref(body.href);
        setLiveStatus("completed");
        sessionIdRef.current = null;
        return body;
      } catch (caught) {
        setLiveStatus("error");
        setError(
          caught instanceof Error
            ? caught.message
            : "실시간 기록을 완료하지 못했습니다.",
        );
        return {};
      }
    },
    [closeMedia, setLiveStatus],
  );

  const reset = useCallback(() => {
    closeMedia();
    sessionIdRef.current = null;
    setLiveStatus("idle");
    setPartialText("");
    setUtterances([]);
    setError(null);
    setMeetingHref(null);
  }, [closeMedia, setLiveStatus]);

  useEffect(
    () => () => {
      const sessionId = sessionIdRef.current;
      if (
        sessionId &&
        (statusRef.current === "recording" ||
          statusRef.current === "connecting")
      ) {
        if (channelRef.current?.readyState === "open") {
          try {
            channelRef.current.send(
              JSON.stringify({ type: "input_audio_buffer.commit" }),
            );
          } catch {
            // 종료 중 채널이 먼저 닫혀도 저장된 발화는 완료 처리한다.
          }
        }
        const durationSec = Math.max(
          0,
          (Date.now() - startedAtRef.current) / 1000,
        );
        void fetch(`/api/stt/realtime/${sessionId}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ durationSec, finalizeTeam: false }),
          keepalive: true,
        });
        sessionIdRef.current = null;
      }
      closeMedia();
    },
    [closeMedia],
  );

  return {
    status,
    isRecording: status === "recording" || status === "connecting",
    partialText,
    utterances,
    error,
    meetingHref,
    start,
    stop,
    reset,
  };
}
