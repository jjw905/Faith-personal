import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import {
  completeUserUpload,
  getUserStorageUsage,
} from "@/lib/storage/vault-service";

export async function POST(request: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }

  const body = (await request.json()) as {
    id?: string;
    key?: string;
    name?: string;
    size?: number;
    mime?: string;
    purpose?: string;
  };

  const id = String(body.id ?? "");
  const key = String(body.key ?? "");
  const name = String(body.name ?? "").trim();
  const size = Number(body.size ?? 0);
  const mime = String(body.mime ?? "application/octet-stream");
  const purposeRaw = String(body.purpose ?? "VAULT").toUpperCase();
  const purpose = purposeRaw === "MEETING" ? "MEETING" : "VAULT";

  if (!id || !key || !name) {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }

  try {
    const saved = await completeUserUpload({
      userId: session.user.id,
      id,
      key,
      fileName: name,
      mime,
      size,
      purpose,
    });
    const usage = await getUserStorageUsage(session.user.id);
    return NextResponse.json({
      ok: true,
      item: {
        id: saved.id,
        name: saved.name,
        size: saved.size,
        mime: saved.mime,
        purpose: saved.purpose,
        createdAt: saved.createdAt.toISOString(),
      },
      usage,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message : "업로드 완료 처리에 실패했습니다.",
      },
      { status: 400 },
    );
  }
}