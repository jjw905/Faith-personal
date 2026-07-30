import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { getUploadQuotaStatus } from "@/lib/stt/usage-quota";

export const dynamic = "force-dynamic";

/** 업로드 분석 전용 월간 쿼터 현황(오픈 준비 기간 한정). 본인 것만 조회. */
export async function GET() {
  const session = await requireUser();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const status = await getUploadQuotaStatus(session.user.id);
  return NextResponse.json({ ok: true, ...status });
}
