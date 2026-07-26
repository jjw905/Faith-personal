import { Role } from "@prisma/client";

/** ADMIN_EMAILS 환경변수 목록 (소문자). */
export function platformAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdminEmail(email: string | null | undefined) {
  const normalized = email?.trim().toLowerCase() ?? "";
  if (!normalized) return false;
  return platformAdminEmails().includes(normalized);
}

export { Role };
