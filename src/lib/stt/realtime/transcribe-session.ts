import WebSocket from "ws";

import {
  REALTIME_STT_MODEL,
  REALTIME_STT_USD_PER_MINUTE,
  type RealtimeTranscribeProgress,
  type RealtimeTranscribeResult,
  type RealtimeUtterance,
} from "@/lib/stt/realtime/types";
import { audioToPcm24k, cleanupWorkDir, iterPcmChunks } from "@/lib/stt/realtime/pcm";

type SessionOpts = {
  language?: string;
  /** whisper delay: minimal|low|medium|high|xhigh */
  delay?: "minimal" | "low" | "medium" | "high" | "xhigh";
  /** 이 초마다 commit (VAD 없음). */
  commitEverySec?: number;
  onProgress?: (p: RealtimeTranscribeProgress) => void;
  /** 평가용: 앞에서 N초만. */
  maxAudioSec?: number;
};

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
        model: REALTIME_STT_MODEL,
        language,
        durationSec,
        utterances: orderedUtterances,
        text,
        firstDeltaMs,
        wallMs: Date.now() - wallStart,
        estimatedUsd: (durationSec / 60) * REALTIME_STT_USD_PER_MINUTE,
        eventCounts,
      });
    };

    const bump = (type: string) => {
      eventCounts[type] = (eventCounts[type] ?? 0) + 1;
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
        fail(
          new Error(
            typeof event.error === "object" && event.error
              ? JSON.stringify(event.error)
              : "realtime error",
          ),
        );
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
            audio: {
              input: {
                format: { type: "audio/pcm", rate: 24000 },
                transcription: {
                  model: REALTIME_STT_MODEL,
                  language,
                  delay,
                },
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

          if (sinceCommit > 0.05) {
            commitWindows.push({
              startSec: lastCommitSec,
              endSec: audioSentSec,
            });
            lastCommitSec = audioSentSec;
            ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
            pendingCommits += 1;
          }

          // 남은 completed 이벤트 대기
          const deadline = Date.now() + 45_000;
          while (pendingCommits > 0 && Date.now() < deadline) {
            await sleep(200);
          }
          // 마지막 여유
          await sleep(800);
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
