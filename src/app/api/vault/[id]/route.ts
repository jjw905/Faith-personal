import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import {
  deleteUserFile,
  getUserFileDownloadUrl,
} from "@/lib/storage/vault-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  try {
    const file = await getUserFileDownloadUrl(session.user.id, id);
    if (!file) {
      return NextResponse.json({ ok: false, message: "파일 없음" }, { status: 404 });
    }
    return NextResponse.json({
      ok: true,
      url: file.url,
      name: file.row.name,
      mime: file.row.mime,
      size: file.row.size,
      createdAt: file.row.createdAt.toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "다운로드 실패",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const ok = await deleteUserFile(session.user.id, id);
  if (!ok) {
    return NextResponse.json({ ok: false, message: "파일 없음" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
