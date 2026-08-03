import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { canReadMeeting } from "@/lib/meeting-access";
import { resolveReplayAudioFile } from "@/lib/meeting-replay-audio";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { localObjectPath } from "@/lib/storage/local-disk";
import {
  assertObjectStorageReady,
  getDownloadUrl,
  objectStorageConfigured,
} from "@/lib/storage/object-store";
import {
  readUserFileBytes,
  readUserFileRange,
  streamUserChunkedFile,
} from "@/lib/storage/vault-service";
import { getUserMeeting } from "@/lib/user-meetings-store";
import { safeVaultMime } from "@/lib/vault";

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

function audioHeaders(params: {
  id: string;
  mime: string;
  length: number;
  range?: { start: number; end: number } | null;
  total: number;
}) {
  const headers: Record<string, string> = {
    "Content-Type": params.mime,
    "Content-Length": String(params.length),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename="${params.id.replace(/[^A-Za-z0-9_-]/g, "")}-replay"`,
  };
  if (params.range) {
    headers["Content-Range"] =
      `bytes ${params.range.start}-${params.range.end}/${params.total}`;
  }
  return headers;
}

function bufferResponse(params: {
  id: string;
  body: Buffer;
  mime: string;
  total: number;
  range?: { start: number; end: number } | null;
}) {
  return new NextResponse(params.body as unknown as BodyInit, {
    status: params.range ? 206 : 200,
    headers: audioHeaders({
      id: params.id,
      mime: params.mime,
      length: params.body.length,
      range: params.range,
      total: params.total,
    }),
  });
}

function fileResponse(params: {
  request: Request;
  id: string;
  path: string;
  mime: string;
}) {
  const size = statSync(params.path).size;
  const range = parseRange(params.request.headers.get("range"), size);
  const start = range?.start ?? 0;
  const end = range?.end ?? size - 1;
  const nodeStream = createReadStream(params.path, { start, end });
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;
  return new NextResponse(webStream, {
    status: range ? 206 : 200,
    headers: audioHeaders({
      id: params.id,
      mime: params.mime,
      length: end - start + 1,
      range,
      total: size,
    }),
  });
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
  if (access.teamMeeting && access.maskedOnly) {
    return NextResponse.json(
      { ok: false, message: "음성 원본은 팀장 정책에 따라 열람할 수 없습니다." },
      { status: 403 },
    );
  }

  // 업로드 원본은 업로더 소유지만, 이 엔드포인트는 위에서 회의 열람 권한을
  // 확인했다. 팀원에게 보관함 소유자 전용 URL을 주면 404가 나므로 여기서
  // 소유자를 확정한 뒤 같은 Range 스트리밍 규칙으로 제공한다.
  const uploaded = await getUserMeeting(id);
  if (uploaded?.vaultFileId) {
    try {
      const row = await prisma.vaultFile.findFirst({
        where: { id: uploaded.vaultFileId, userId: uploaded.userId },
      });
      if (row) {
        const mime = safeVaultMime(row.name, row.mime);
        if (row.contentEncryption) {
          const rangeHeader = request.headers.get("range");
          const range = parseRange(rangeHeader, row.size);
          if (rangeHeader && !range) {
            return new NextResponse(null, {
              status: 416,
              headers: { "Content-Range": `bytes */${row.size}` },
            });
          }
          if (range) {
            const file = await readUserFileRange({
              userId: uploaded.userId,
              fileId: row.id,
              start: range.start,
              end: range.end,
            });
            if (!file) {
              return NextResponse.json(
                { ok: false, message: "녹음 없음" },
                { status: 404 },
              );
            }
            return bufferResponse({
              id,
              body: file.body,
              mime,
              total: file.total,
              range,
            });
          }
          const chunked = await streamUserChunkedFile(uploaded.userId, row.id);
          if (chunked) {
            return new NextResponse(chunked.stream, {
              status: 200,
              headers: audioHeaders({
                id,
                mime,
                length: chunked.total,
                total: chunked.total,
              }),
            });
          }
          const file = await readUserFileBytes(uploaded.userId, row.id);
          if (!file) {
            return NextResponse.json(
              { ok: false, message: "녹음 없음" },
              { status: 404 },
            );
          }
          return bufferResponse({
            id,
            body: file.body,
            mime,
            total: file.body.length,
          });
        }
        if (objectStorageConfigured()) {
          return NextResponse.redirect(await getDownloadUrl(row.key));
        }
        assertObjectStorageReady();
        return fileResponse({
          request,
          id,
          path: localObjectPath(row.key),
          mime,
        });
      }
    } catch (error) {
      console.error("[replay-audio] 업로드 원본 스트리밍 실패", {
        meetingId: id,
        message: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { ok: false, message: "녹음을 열지 못했습니다." },
        { status: 500 },
      );
    }
  }

  const file = await resolveReplayAudioFile(id);
  if (!file) {
    return NextResponse.json(
      { ok: false, message: "녹음 없음" },
      { status: 404 },
    );
  }

  return fileResponse({
    request,
    id,
    path: file.absolutePath,
    mime: file.mime,
  });
}
