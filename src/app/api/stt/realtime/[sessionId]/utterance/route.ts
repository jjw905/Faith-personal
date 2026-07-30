import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { persistRealtimeUtterance } from "@/lib/stt/realtime/live-session-store";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const userSession = await requireUser();
  if (!userSession) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const { sessionId } = await context.params;

  let body: {
    itemId?: string;
    sequence?: number;
    text?: string;
    startSec?: number;
    endSec?: number;
    confidence?: number;
    meanLogprob?: number;
  };
  let audioBytes: Buffer | undefined;
  let audioFilename: string | undefined;
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      body = JSON.parse(String(form.get("utterance") ?? "{}")) as typeof body;
      const audio = form.get("audio");
      if (audio instanceof File) {
        if (audio.size > 4 * 1024 * 1024) {
          return NextResponse.json(
            { ok: false, message: "재전사 음성 구간이 너무 큽니다." },
            { status: 413 },
          );
        }
        audioBytes = Buffer.from(await audio.arrayBuffer());
        audioFilename = audio.name || "utterance.wav";
      }
    } else {
      body = await request.json();
    }
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const itemId = body.itemId?.trim().slice(0, 200);
  const text = body.text?.trim();
  if (!itemId || !text || text.length > 8_000) {
    return NextResponse.json(
      { ok: false, message: "전사 발화 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  try {
    const result = await persistRealtimeUtterance({
      sessionId,
      userId: userSession.user.id,
      itemId,
      sequence:
        typeof body.sequence === "number" && Number.isFinite(body.sequence)
          ? body.sequence
          : 0,
      text,
      startSec:
        typeof body.startSec === "number" && Number.isFinite(body.startSec)
          ? body.startSec
          : 0,
      endSec:
        typeof body.endSec === "number" && Number.isFinite(body.endSec)
          ? body.endSec
          : undefined,
      confidence:
        typeof body.confidence === "number" && Number.isFinite(body.confidence)
          ? body.confidence
          : undefined,
      meanLogprob:
        typeof body.meanLogprob === "number" &&
        Number.isFinite(body.meanLogprob)
          ? body.meanLogprob
          : undefined,
      audioBytes,
      audioFilename,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "전사 발화를 저장하지 못했습니다.",
      },
      { status: 404 },
    );
  }
}
