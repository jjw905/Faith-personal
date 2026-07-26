import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { canReadMeeting } from "@/lib/meeting-access";
import { resolveReplayAudioFile } from "@/lib/meeting-replay-audio";
import { requireUser } from "@/lib/require-user";

type Params = { params: Promise<{ id: string }> };

function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | null {
  if (!header || !header.startsWith("bytes=")) return null;
  const spec = header.slice("bytes=".length).trim();
  const [rawStart, rawEnd] = spec.split("-", 2);
  let start = rawStart ? Number(rawStart) : NaN;
  let end = rawEnd ? Number(rawEnd) : NaN;
  if (!Number.isFinite(start) && Number.isFinite(end)) {
    start = Math.max(0, size - end);
    end = size - 1;
  } else {
    if (!Number.isFinite(start)) start = 0;
    if (!Number.isFinite(end) || end >= size) end = size - 1;
  }
  if (start < 0 || end < start || start >= size) return null;
  return { start, end };
}

/** meeting.replayAudio 원본 스트리밍. Range seek 지원. */
export async function GET(request: Request, { params }: Params) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const { id } = await params;
  const access = await canReadMeeting(id, session.user.id);
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, message: "열람 권한 없음" },
      { status: 404 },
    );
  }

  const file = resolveReplayAudioFile(id);
  if (!file) {
    return NextResponse.json(
      { ok: false, message: "녹음 없음" },
      { status: 404 },
    );
  }

  const size = statSync(file.absolutePath).size;
  const range = parseRange(request.headers.get("range"), size);
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const chunkSize = end - start + 1;

  const nodeStream = createReadStream(file.absolutePath, { start, end });
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  const headers: Record<string, string> = {
    "Content-Type": file.mime,
    "Content-Length": String(chunkSize),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "Content-Disposition": `inline; filename="${id.replace(/[^A-Za-z0-9_-]/g, "")}-replay"`,
  };
  if (range) {
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }

  return new NextResponse(webStream, {
    status: range ? 206 : 200,
    headers,
  });
}
