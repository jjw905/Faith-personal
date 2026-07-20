import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { prepareUserUpload } from "@/lib/storage/vault-service";

export async function POST(request: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json()) as {
    name?: string;
    size?: number;
    mime?: string;
    purpose?: string;
  };

  const name = String(body.name ?? "").trim();
  const size = Number(body.size ?? 0);
  const mime = String(body.mime ?? "application/octet-stream");
  const purposeRaw = String(body.purpose ?? "VAULT").toUpperCase();
  const purpose = purposeRaw === "MEETING" ? "MEETING" : "VAULT";

  if (!name) {
    return NextResponse.json({ ok: false, message: "파일 이름이 필요합니다." }, { status: 400 });
  }

  try {
    const prepared = await prepareUserUpload({
      userId: session.user.id,
      fileName: name,
      mime,
      size,
      purpose,
    });
    return NextResponse.json({
      ok: true,
      mode: prepared.mode,
      id: prepared.id,
      key: prepared.key,
      uploadUrl: prepared.uploadUrl,
      mime: prepared.mime,
      purpose: prepared.purpose,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "업로드 준비에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}
