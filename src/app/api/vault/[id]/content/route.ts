import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { localObjectPath } from "@/lib/storage/local-disk";
import { prisma } from "@/lib/prisma";
import {
  assertObjectStorageReady,
  getDownloadUrl,
  localVaultAllowed,
  objectStorageConfigured,
} from "@/lib/storage/object-store";
import {
  readUserFileBytes,
  readUserFileRange,
  streamUserChunkedFile,
} from "@/lib/storage/vault-service";
import { safeVaultMime, vaultContentDisposition } from "@/lib/vault";

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

/** 로컬 디스크 파일 스트리밍. Range seek 지원. */
export async function GET(request: Request, { params }: Params) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  if (!objectStorageConfigured() && !localVaultAllowed()) {
    return NextResponse.json(
      { ok: false, message: "로컬 파일 읽기를 사용할 수 없습니다." },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const row = await prisma.vaultFile.findFirst({
      where: {
        id,
        OR: [
          { userId: session.user.id },
          {
            teamId: { not: null },
            team: {
              members: { some: { userId: session.user.id } },
            },
          },
        ],
      },
    });
    if (!row) {
      return NextResponse.json(
        { ok: false, message: "파일 없음" },
        { status: 404 },
      );
    }

    if (row.contentEncryption) {
      let mime = "application/octet-stream";
      try {
        mime = safeVaultMime(row.name, row.mime);
      } catch {
        mime = "application/octet-stream";
      }
      const disposition = vaultContentDisposition(row.name, mime);
      const rangeHeader = request.headers.get("range");
      const range = parseRange(rangeHeader, row.size);
      if (rangeHeader && !range) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${row.size}` },
        });
      }
      if (!range) {
        const chunked = await streamUserChunkedFile(session.user.id, id);
        if (chunked) {
          return new NextResponse(chunked.stream, {
            status: 200,
            headers: {
              "Content-Type": mime,
              "Content-Length": String(chunked.total),
              "Accept-Ranges": "bytes",
              "Cache-Control": "private, no-store",
              "X-Content-Type-Options": "nosniff",
              "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
            },
          });
        }
      }
      const file = range
        ? await readUserFileRange({
            userId: session.user.id,
            fileId: id,
            start: range.start,
            end: range.end,
          })
        : await readUserFileBytes(session.user.id, id);
      if (!file) {
        return NextResponse.json(
          { ok: false, message: "파일 없음" },
          { status: 404 },
        );
      }
      const body = file.body;
      const start = range?.start ?? 0;
      const end = range?.end ?? body.length - 1;
      const headers: Record<string, string> = {
        "Content-Type": mime,
        "Content-Length": String(body.length),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
      };
      if (range) {
        headers["Content-Range"] = `bytes ${start}-${end}/${row.size}`;
      }
      return new NextResponse(body as unknown as BodyInit, {
        status: range ? 206 : 200,
        headers,
      });
    }

    if (objectStorageConfigured()) {
      assertObjectStorageReady();
      const url = await getDownloadUrl(row.key);
      return NextResponse.redirect(url);
    }

    assertObjectStorageReady();
    const absolutePath = localObjectPath(row.key);
    const size = statSync(absolutePath).size;
    const range = parseRange(request.headers.get("range"), size);
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    const chunkSize = end - start + 1;

    const nodeStream = createReadStream(absolutePath, { start, end });
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    // DB에 남은 잘못된 mime(레거시)도 확장자로 덮어 동일 출처 XSS를 막는다.
    let mime = "application/octet-stream";
    try {
      mime = safeVaultMime(row.name, row.mime);
    } catch {
      mime = "application/octet-stream";
    }
    const disposition = vaultContentDisposition(row.name, mime);

    const headers: Record<string, string> = {
      "Content-Type": mime,
      "Content-Length": String(chunkSize),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${disposition}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    };
    if (range) {
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    }

    return new NextResponse(webStream, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "파일을 열지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
