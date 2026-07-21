import { SocialLinksCard } from "@/components/account/social-links-card";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

const LINKABLE = ["google", "naver", "twitter"] as const;

function availableProviders() {
  return LINKABLE.filter((p) => {
    if (p === "google") {
      return Boolean(
        process.env.AUTH_GOOGLE_ID?.trim() &&
          process.env.AUTH_GOOGLE_SECRET?.trim(),
      );
    }
    if (p === "naver") {
      return Boolean(
        process.env.AUTH_NAVER_ID?.trim() &&
          process.env.AUTH_NAVER_SECRET?.trim(),
      );
    }
    return Boolean(
      process.env.AUTH_TWITTER_ID?.trim() &&
        process.env.AUTH_TWITTER_SECRET?.trim(),
    );
  });
}

function noticeFromSearch(linked?: string, error?: string) {
  if (linked === "1") return "소셜 계정을 연결했습니다.";
  if (error === "EmailConflict") {
    return "이미 다른 계정에 등록된 이메일입니다. 해당 계정으로 로그인한 뒤 연동해 주세요.";
  }
  return undefined;
}

/** 서버에서 연동 상태를 읽어 카드에 전달. */
export async function SocialLinksSection({
  linked,
  error,
}: {
  linked?: string;
  error?: string;
}) {
  const session = await requireUser();
  if (!session) return null;

  const [accounts, user] = await Promise.all([
    prisma.account.findMany({
      where: { userId: session.user.id },
      select: { provider: true },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true },
    }),
  ]);

  const linkedProviders = accounts
    .filter((a) => (LINKABLE as readonly string[]).includes(a.provider))
    .map((a) => a.provider);

  return (
    <SocialLinksCard
      key={linkedProviders.slice().sort().join(",") || "none"}
      initial={{
        linked: linkedProviders,
        available: [...availableProviders()],
        hasPassword: Boolean(user?.passwordHash),
        notice: noticeFromSearch(linked, error),
      }}
    />
  );
}
