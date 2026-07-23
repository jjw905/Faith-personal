"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { maskPii } from "@/lib/masking";
import type { MaskStyle, TranscriptUtterance } from "@/lib/masking/types";

export type LiveUtterance = TranscriptUtterance;

export function useLiveTranscript(
  utterances: LiveUtterance[],
  options?: { charIntervalMs?: number; style?: MaskStyle },
) {
  const charIntervalMs = options?.charIntervalMs ?? 28;
  const style = options?.style ?? "partial";
  const [status, setStatus] = useState<"idle" | "playing" | "paused" | "done">(
    "idle",
  );
  const [visible, setVisible] = useState<LiveUtterance[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [index, setIndex] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusRef = useRef(status);
  const utterancesRef = useRef(utterances);
  const indexRef = useRef(0);
  const visibleRef = useRef<LiveUtterance[]>([]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    utterancesRef.current = utterances;
  }, [utterances]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    statusRef.current = "idle";
    setStatus("idle");
    setVisible([]);
    setStreamingText("");
    setIndex(0);
    indexRef.current = 0;
    visibleRef.current = [];
  }, [clearTimer]);

  const pause = useCallback(() => {
    clearTimer();
    statusRef.current = "paused";
    setStatus("paused");
  }, [clearTimer]);

  const playFromRef = useRef<
    (fromIndex: number, alreadyVisible: LiveUtterance[]) => void
  >(() => {});

  const playFrom = useCallback(
    (fromIndex: number, alreadyVisible: LiveUtterance[]) => {
      const list = utterancesRef.current;
      if (fromIndex >= list.length) {
        statusRef.current = "done";
        setStatus("done");
        setStreamingText("");
        return;
      }

      statusRef.current = "playing";
      setStatus("playing");
      const current = list[fromIndex]!;
      let charPos = 0;

      const tickChar = () => {
        if (statusRef.current === "paused") return;

        charPos += 1;
        setStreamingText(current.text.slice(0, charPos));

        if (charPos < current.text.length) {
          timerRef.current = setTimeout(tickChar, charIntervalMs);
          return;
        }

        const completed = [...alreadyVisible, current];
        visibleRef.current = completed;
        indexRef.current = fromIndex + 1;
        setVisible(completed);
        setStreamingText("");
        setIndex(fromIndex + 1);

        timerRef.current = setTimeout(() => {
          if (statusRef.current === "paused") return;
          playFromRef.current(fromIndex + 1, completed);
        }, current.delayMs);
      };

      timerRef.current = setTimeout(tickChar, 120);
    },
    [charIntervalMs],
  );

  useEffect(() => {
    playFromRef.current = playFrom;
  }, [playFrom]);

  const play = useCallback(
    (nextUtterances?: LiveUtterance[]) => {
      clearTimer();
      if (nextUtterances) {
        utterancesRef.current = nextUtterances;
      }
      // 항상 처음부터 새로 재생 (일시정지 이어하기 없음)
      visibleRef.current = [];
      indexRef.current = 0;
      setVisible([]);
      setStreamingText("");
      setIndex(0);
      playFrom(0, []);
    },
    [clearTimer, playFrom],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  const rawText = useMemo(() => {
    const base = visible.map((u) => `${u.speaker}: ${u.text}`).join("\n");
    if (!streamingText) return base;
    const current = utterances[index];
    const line = current ? `${current.speaker}: ${streamingText}` : streamingText;
    return base ? `${base}\n${line}` : line;
  }, [visible, streamingText, utterances, index]);

  const maskedResult = useMemo(
    () => maskPii(rawText, { style }),
    [rawText, style],
  );

  const maskedUtterances = useMemo(() => {
    return visible.map((u) => {
      const masked = maskPii(u.text, { style });
      return {
        ...u,
        maskedSpeaker: maskPii(`${u.speaker}님`, { style }).masked.replace(
          /님$/,
          "",
        ),
        maskedText: masked.masked,
        matches: masked.matches,
      };
    });
  }, [visible, style]);

  const streamingMask = useMemo(() => {
    if (!streamingText) return null;
    return maskPii(streamingText, { style });
  }, [streamingText, style]);

  return {
    status,
    visible,
    streamingText,
    streamingMasked: streamingMask?.masked ?? "",
    streamingMatches: streamingMask?.matches ?? [],
    index,
    rawText,
    maskedResult,
    maskedUtterances,
    play,
    pause,
    reset,
  };
}
