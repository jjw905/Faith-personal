import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import {
  clearUserVault,
  getUserStorageUsage,
  listUserVaultFiles,
} from "@/lib/storage/vault-service";

export async function GET() {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }

  const [files, usage] = await Promise.all([
    listUserVaultFiles(session.user.id),
    getUserStorageUsage(session.user.id),
  ]);

  return NextResponse.json({
    ok: true,
    usage,
    items: files.map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      mime: f.mime,
      purpose: f.purpose,
      createdAt: f.createdAt.toISOString(),
    })),
  });
}

export async function DELETE(request: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }

  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";
  if (all) {
    const count = await clearUserVault(session.user.id);
    const usage = await getUserStorageUsage(session.user.id);
    return NextResponse.json({ ok: true, count, usage });
  }

  return NextResponse.json({ ok: false, message: "잘못된 요청" }, { status: 400 });
}
