import WebSocket from "ws";

import {
  DEFAULT_REALTIME_STT_MODEL,
  REALTIME_STT_MINI,
  REALTIME_STT_USD_PER_MINUTE,
  type RealtimeSttModel,
  type RealtimeTranscribeProgress,
  type RealtimeTranscribeResult,
  type RealtimeUtterance,
} from "@/lib/stt/realtime/types";
import { audioToPcm24k, cleanupWorkDir, iterPcmChunks } from "@/lib/stt/realtime/pcm";

type SessionOpts = {
  language?: string;
  /** 전사 모델. mini는 server_vad, whisper는 고정 주기 commit. */
  model?: RealtimeSttModel;
  /** whisper delay: minimal|low|medium|high|xhigh */
  delay?: "minimal" | "low" | "medium" | "high" | "xhigh";
  /** 이 초마다 commit (VAD 없음). */
  commitEverySec?: number;
  onProgress?: (p: RealtimeTranscribeProgress) => void;
  /** 평가용: 앞에서 N초만. */
  maxAudioSec?: number;
};

/** 오디오 전송 후 남은 전사를 기다리는 최대 시간. */
const TAIL_WAIT_MS = 60_000;
/** 이 시간 동안 새 이벤트가 없으면 전사가 끝난 것으로 본다. */
const TAIL_QUIET_MS = 3_000;

function eventConfidence(event: Record<string, unknown>): {
  meanLogprob?: number;
  confidence?: number;
} {
  const logprobs = event.logprobs;
  if (!Array.isArray(logprobs)) return {};
  const values = logprobs
    .map((row) =>
      row && typeof row === "object"
        ? Number((row as { logprob?: unknown }).logprob)
        : Number.NaN,
    )
    .filter(Number.isFinite);
  if (values.length === 0) return {};
  const meanLogprob =
    values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    meanLogprob,
    confidence: Math.max(0, Math.min(1, Math.exp(meanLogprob))),
  };
}

function getApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key || key === "your_openai_api_key_here") {
    throw new Error("OPENAI_API_KEY가 필요합니다.");
  }
  return key;
}

/**
 * Realtime transcription 세션으로 오디오 파일을 스트리밍 전사.
 * 모델이 델타/완료 이벤트로 텍스트를 내고, 서버는 연결·커밋만 한다.
 */
export async function realtimeTranscribeFile(
  audioPath: string,
  opts: SessionOpts = {},
): Promise<RealtimeTranscribeResult> {
  const language = opts.language ?? "ko";
  const model = opts.model ?? DEFAULT_REALTIME_STT_MODEL;
  const useServerVad = model === REALTIME_STT_MINI;
  const delay = opts.delay ?? "low";
  const commitEverySec = opts.commitEverySec ?? 4;
  const workDir = `.data/tmp-realtime-${Date.now().toString(36)}`;
  const wallStart = Date.now();

  const { pcm, durationSec: fullDur } = audioToPcm24k(audioPath, workDir);
  const durationSec = Math.min(
    fullDur,
    opts.maxAudioSec && opts.maxAudioSec > 0 ? opts.maxAudioSec : fullDur,
  );
  const maxBytes = Math.floor(durationSec * 24000 * 2);
  const pcmUse = pcm.subarray(0, maxBytes - (maxBytes % 2));

  const utterances: RealtimeUtterance[] = [];
  const eventCounts: Record<string, number> = {};
  let partialText = "";
  let firstDeltaMs: number | null = null;
  let audioSentSec = 0;
  let pendingCommits = 0;
  let closed = false;
  let lastCommitSec = 0;
  let lastEventAtMs = Date.now();
  let nextAddedWindow = 0;
  let nextFallbackWindow = 0;
  const commitWindows: Array<{ startSec: number; endSec: number }> = [];
  const windowByItemId = new Map<
    string,
    { startSec: number; endSec: number }
  >();

  const url = "wss://api.openai.com/v1/realtime?intent=transcription";

  const result = await new Promise<RealtimeTranscribeResult>((resolve, reject) => {
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
      },
    });

    const fail = (err: unknown) => {
      if (closed) return;
      closed = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      cleanupWorkDir(workDir);
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const finish = () => {
      if (closed) return;
      closed = true;
      try {
        ws.close();
      } catch {
        // ignore
      }
      cleanupWorkDir(workDir);
      const orderedUtterances = [...utterances].sort(
        (a, b) => a.startSec - b.startSec,
      );
      const text = orderedUtterances
        .map((u) => u.text.trim())
        .filter(Boolean)
        .join("\n");
      resolve({
        model,
        language,
        durationSec,
        utterances: orderedUtterances,
        text,
        firstDeltaMs,
        wallMs: Date.now() - wallStart,
        estimatedUsd:
          (durationSec / 60) * REALTIME_STT_USD_PER_MINUTE[model],
        eventCounts,
        droppedTurns: Math.max(0, pendingCommits),
        billedAudioSec: durationSec,
      });
    };

    const bump = (type: string) => {
      eventCounts[type] = (eventCounts[type] ?? 0) + 1;
      lastEventAtMs = Date.now();
    };

    const emitProgress = () => {
      opts.onProgress?.({
        partialText,
        utterances: [...utterances],
        audioSentSec,
      });
    };

    ws.on("error", (err) => fail(err));

    ws.on("message", (raw) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = String(event.type || "unknown");
      bump(type);

      if (type === "error") {
        const detail =
          typeof event.error === "object" && event.error
            ? JSON.stringify(event.error)
            : "realtime error";
        // 마지막 flush commit 때 버퍼가 비어 있으면 정상 상황이다.
        if (/buffer_?(is_)?empty|buffer_too_small|commit_empty/i.test(detail)) {
          return;
        }
        fail(new Error(detail));
        return;
      }

      // server_vad: 발화 시작 시각이 이벤트로 온다.
      if (type === "input_audio_buffer.speech_started") {
        const itemId = String(event.item_id ?? "");
        const startMs = Number(event.audio_start_ms);
        if (itemId && Number.isFinite(startMs)) {
          const startSec = Math.max(0, startMs / 1000);
          windowByItemId.set(itemId, { startSec, endSec: startSec });
          pendingCommits += 1;
        }
        return;
      }

      if (type === "input_audio_buffer.speech_stopped") {
        const itemId = String(event.item_id ?? "");
        const endMs = Number(event.audio_end_ms);
        const window = windowByItemId.get(itemId);
        if (window && Number.isFinite(endMs)) {
          window.endSec = Math.max(window.startSec, endMs / 1000);
        }
        return;
      }

      if (
        type === "conversation.item.added" &&
        event.item &&
        typeof event.item === "object"
      ) {
        const itemId = String(
          (event.item as Record<string, unknown>).id ?? "",
        );
        const window = commitWindows[nextAddedWindow];
        if (itemId && window) {
          windowByItemId.set(itemId, window);
          nextAddedWindow += 1;
        }
        return;
      }

      if (
        type === "conversation.item.input_audio_transcription.delta" ||
        type === "conversation.item.audio_transcription.delta"
      ) {
        if (firstDeltaMs == null) firstDeltaMs = Date.now() - wallStart;
        const delta = String(event.delta ?? "");
        partialText += delta;
        emitProgress();
        return;
      }

      if (
        type === "conversation.item.input_audio_transcription.completed" ||
        type === "conversation.item.audio_transcription.completed"
      ) {
        const transcript = String(event.transcript ?? "").trim();
        const itemId = String(event.item_id ?? `u${utterances.length + 1}`);
        const window =
          windowByItemId.get(itemId) ??
          commitWindows[nextFallbackWindow] ?? {
            startSec: Math.max(0, audioSentSec - commitEverySec),
            endSec: audioSentSec,
          };
        nextFallbackWindow += 1;
        if (transcript) {
          utterances.push({
            itemId,
            text: transcript,
            startSec: window.startSec,
            endSec:
              window.endSec > window.startSec ? window.endSec : undefined,
            ...eventConfidence(event),
            completedAtMs: Date.now() - wallStart,
          });
        }
        partialText = "";
        pendingCommits = Math.max(0, pendingCommits - 1);
        emitProgress();
        return;
      }
    });

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "transcription",
            include: ["item.input_audio_transcription.logprobs"],
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                transcription: useServerVad
                  ? { model, language }
                  : { model, language, delay },
                turn_detection: useServerVad
                  ? {
                      type: "server_vad",
                      threshold: 0.5,
                      prefix_padding_ms: 300,
                      silence_duration_ms: 600,
                    }
                  : null,
              },
            },
          },
        }),
      );

      void (async () => {
        try {
          // session.update 반영 대기
          await sleep(400);
          let sinceCommit = 0;

          for (const chunk of iterPcmChunks(pcmUse, 0.1)) {
            if (closed) return;
            ws.send(
              JSON.stringify({
                type: "input_audio_buffer.append",
                audio: chunk.bytes.toString("base64"),
              }),
            );
            audioSentSec = chunk.endSec;
            sinceCommit += chunk.endSec - chunk.startSec;

            if (useServerVad) {
              // 서버가 턴을 끊는다. 전송만 하고 1초마다 숨을 돌린다.
              if (sinceCommit >= 1) {
                sinceCommit = 0;
                emitProgress();
                await sleep(15);
              }
              continue;
            }

            if (sinceCommit >= commitEverySec) {
              commitWindows.push({
                startSec: lastCommitSec,
                endSec: audioSentSec,
              });
              lastCommitSec = audioSentSec;
              ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
              pendingCommits += 1;
              sinceCommit = 0;
              // 과속 전송 완화
              await sleep(30);
            }
          }

          if (useServerVad) {
            // 마지막 발화가 무음으로 끝나지 않으면 서버가 턴을 못 닫는다.
            // 남은 버퍼를 직접 commit 해서 꼬리를 살린다.
            ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          } else if (sinceCommit > 0.05) {
            commitWindows.push({
              startSec: lastCommitSec,
              endSec: audioSentSec,
            });
            lastCommitSec = audioSentSec;
            ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
            pendingCommits += 1;
          }

          // 남은 전사 대기.
          // 파일을 실시간보다 빠르게 보내면 이벤트가 뒤늦게 오므로,
          // 미완료가 없고 일정 시간 조용해질 때까지 기다린다.
          const deadline = Date.now() + TAIL_WAIT_MS;
          lastEventAtMs = Date.now();
          while (Date.now() < deadline) {
            if (pendingCommits === 0 && Date.now() - lastEventAtMs > TAIL_QUIET_MS) {
              break;
            }
            await sleep(200);
          }
          if (pendingCommits > 0) {
            console.warn(
              `[realtime] 전사 미완료 ${pendingCommits}건. 뒷부분이 누락될 수 있습니다.`,
            );
          }
          finish();
        } catch (err) {
          fail(err);
        }
      })();
    });

    ws.on("close", () => {
      if (!closed) finish();
    });
  });

  return result;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
