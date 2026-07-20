import { prisma } from "@/lib/prisma";

/** credentials 외 소셜 제공자 여부. */
export function isOAuthProvider(provider?: string | null): boolean {
  return Boolean(provider && provider !== "credentials");
}

/**
 * 소셜 로그인은 제공자가 이메일을 검증하므로 별도 인증 메일 없이 통과.
 * 이메일이 있는 OAuth 계정이면 즉시 verified 대상.
 */
export function shouldAutoVerify(
  provider: string | null | undefined,
  email: string | null | undefined,
): boolean {
  return isOAuthProvider(provider) && Boolean(email && email.trim());
}

/** 아직 미인증이면 emailVerified를 채워준다. 이미 인증됐으면 쓰지 않음. */
export async function ensureVerified(
  userId: string,
  alreadyVerified?: boolean,
): Promise<void> {
  if (alreadyVerified) return;
  await prisma.user.update({
    where: { id: userId },
    data: { emailVerified: new Date() },
  });
}
