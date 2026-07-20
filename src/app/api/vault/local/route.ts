import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { completeLocalUpload } from "@/lib/storage/vault-service";

/** Spaces 미설정 시 서버 로컬 디스크 업로드. */
export async function POST(request: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청" }, { status: 400 });
  }

  const file = form.get("file");
  const id = String(form.get("id") ?? "");
  const key = String(form.get("key") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const mime = String(form.get("mime") ?? "application/octet-stream");
  const purposeRaw = String(form.get("purpose") ?? "VAULT").toUpperCase();
  const purpose = purposeRaw === "MEETING" ? "MEETING" : "VAULT";

  if (!(file instanceof File) || !id || !key || !name) {
    return NextResponse.json({ ok: false, message: "파일 정보가 필요합니다." }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const row = await completeLocalUpload({
      userId: session.user.id,
      id,
      key,
      fileName: name,
      mime: mime || file.type || "application/octet-stream",
      size: buf.length,
      purpose,
      body: buf,
    });
    return NextResponse.json({
      ok: true,
      item: {
        id: row.id,
        name: row.name,
        size: row.size,
        mime: row.mime,
        purpose: row.purpose,
        createdAt: row.createdAt.toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "업로드 실패";
    const storageMissing = /Spaces|스토리지|로컬 업로드/i.test(message);
    return NextResponse.json(
      { ok: false, message },
      { status: storageMissing ? 503 : 400 },
    );
  }
}
