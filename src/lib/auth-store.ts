import { normalizeAuthEmail } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";

/** 이메일 회원가입용 — DB에 이미 있으면 taken */
export async function registerEmail(email: string) {
  const e = normalizeAuthEmail(email);
  await prisma.user.upsert({
    where: { email: e },
    create: { email: e },
    update: {},
  });
}

/**
 * 가입/변경 충돌 검사.
 * 정규화 주소 + (레거시) 원문 lower-case 둘 다 확인.
 */
export async function isEmailTaken(email: string) {
  const canonical = normalizeAuthEmail(email);
  const raw = email.trim().toLowerCase();
  const byCanonical = await prisma.user.findUnique({
    where: { email: canonical },
    select: { id: true },
  });
  if (byCanonical) return true;
  if (raw !== canonical) {
    const byRaw = await prisma.user.findUnique({
      where: { email: raw },
      select: { id: true },
    });
    if (byRaw) return true;
  }
  return false;
}

/** 로그인 조회용: 정규화 → 원문 순. */
export function authEmailLookupOrder(email: string): string[] {
  const canonical = normalizeAuthEmail(email);
  const raw = email.trim().toLowerCase();
  return raw === canonical ? [canonical] : [canonical, raw];
}
