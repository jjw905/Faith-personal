import { SocialLinksCard } from "@/components/account/social-links-card";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

const LINKABLE = ["naver", "google", "twitter"] as const;

function noticeFromSearch(linked?: string, error?: string) {
  if (linked === "1") return "계정을 연결했어요.";
  if (error === "EmailConflict") {
    return "이미 다른 계정에서 쓰는 이메일이에요. 그 계정으로 로그인한 뒤 연결해 주세요.";
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
      orderBy: { id: "asc" },
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { passwordHash: true, signupProvider: true },
    }),
  ]);

  const linkedProviders = accounts
    .filter((a) => (LINKABLE as readonly string[]).includes(a.provider))
    .map((a) => a.provider);

  const primary =
    user?.signupProvider &&
    (LINKABLE as readonly string[]).includes(user.signupProvider)
      ? user.signupProvider
      : null;

  return (
    <SocialLinksCard
      key={`${linkedProviders.slice().sort().join(",")}|${primary ?? ""}`}
      initial={{
        linked: linkedProviders,
        available: [...LINKABLE],
        primary,
        hasPassword: Boolean(user?.passwordHash),
        notice: noticeFromSearch(linked, error),
      }}
    />
  );
}
