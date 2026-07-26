import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { localObjectPath } from "@/lib/storage/local-disk";
import { prisma } from "@/lib/prisma";
import {
  assertVaultBackendReady,
  localVaultAllowed,
  spacesConfigured,
} from "@/lib/storage/spaces";

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

  if (spacesConfigured() || !localVaultAllowed()) {
    return NextResponse.json(
      { ok: false, message: "로컬 파일 읽기를 사용할 수 없습니다." },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    assertVaultBackendReady();
    const row = await prisma.vaultFile.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!row) {
      return NextResponse.json(
        { ok: false, message: "파일 없음" },
        { status: 404 },
      );
    }

    const absolutePath = localObjectPath(row.key);
    const size = statSync(absolutePath).size;
    const range = parseRange(request.headers.get("range"), size);
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    const chunkSize = end - start + 1;

    const nodeStream = createReadStream(absolutePath, { start, end });
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": row.mime || "application/octet-stream",
      "Content-Length": String(chunkSize),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.name)}`,
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
