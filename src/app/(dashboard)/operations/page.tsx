import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin";

/** 운영 상태 메뉴 제거 — 통합 통계로 안내 */
export default async function OperationsRedirectPage() {
  await requireAdmin();
  redirect("/stats");
}
