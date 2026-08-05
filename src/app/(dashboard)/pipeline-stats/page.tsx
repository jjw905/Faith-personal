import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin";

/** 파이프라인 통계 → 통합 통계로 이전 */
export default async function PipelineStatsRedirectPage() {
  await requireAdmin();
  redirect("/stats");
}
