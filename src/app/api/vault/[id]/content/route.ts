import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { readUserFileContent } from "@/lib/storage/vault-service";

type Params = { params: Promise<{ id: string }> };

/** 로컬 디스크 파일 스트리밍. */
export async function GET(_request: Request, { params }: Params) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  try {
    const file = await readUserFileContent(session.user.id, id);
    if (!file) {
      return NextResponse.json({ ok: false, message: "파일 없음" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(file.body), {
      status: 200,
      headers: {
        "Content-Type": file.row.mime || "application/octet-stream",
        "Content-Length": String(file.body.length),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.row.name)}`,
        "Cache-Control": "private, no-store",
      },
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
