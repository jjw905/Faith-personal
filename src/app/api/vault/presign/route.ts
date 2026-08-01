import { NextResponse } from "next/server";

import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/require-user";
import { prepareUserUpload } from "@/lib/storage/vault-service";

export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "vault-presign", 30, 60_000);
  if (limited) return limited;

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
    const message =
      err instanceof Error ? err.message : "업로드 준비에 실패했습니다.";
    const storageMissing = /GCS|S3|Spaces|객체 저장소|스토리지/i.test(message);
    return NextResponse.json(
      { ok: false, message },
      { status: storageMissing ? 503 : 400 },
    );
  }
}
