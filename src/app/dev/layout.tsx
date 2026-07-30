import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/admin";

/**
 * 개발 전용 표면.
 * production: 숨김. development: 플랫폼 관리자만.
 */
export default async function DevSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  await requireAdmin();
  return children;
}
