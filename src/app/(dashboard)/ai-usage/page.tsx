import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin";

/** AI 사용량 → 통합 통계로 이전 */
export default async function AiUsageRedirectPage() {
  await requireAdmin();
  redirect("/stats");
}
