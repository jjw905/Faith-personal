import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Naver from "next-auth/providers/naver";
import Twitter from "next-auth/providers/twitter";
import type { Role } from "@prisma/client";
import type { Provider } from "next-auth/providers";
import { cookies, headers } from "next/headers";

import { ensureVerified, shouldAutoVerify } from "@/lib/account-verification";
import { isValidEmail } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";

class InvalidCredentials extends CredentialsSignin {
  code = "invalid_credentials";
}
class RateLimitedCredentials extends CredentialsSignin {
  code = "rate_limited";
}
class DisabledCredentials extends CredentialsSignin {
  code = "disabled";
}

function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function oauthProviders(): Provider[] {
  const list: Provider[] = [];
  if (process.env.AUTH_GOOGLE_ID?.trim() && process.env.AUTH_GOOGLE_SECRET?.trim()) {
    list.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      }),
    );
  }
  if (process.env.AUTH_NAVER_ID?.trim() && process.env.AUTH_NAVER_SECRET?.trim()) {
    list.push(
      Naver({
        clientId: process.env.AUTH_NAVER_ID,
        clientSecret: process.env.AUTH_NAVER_SECRET,
      }),
    );
  }
  if (process.env.AUTH_TWITTER_ID?.trim() && process.env.AUTH_TWITTER_SECRET?.trim()) {
    list.push(
      Twitter({
        clientId: process.env.AUTH_TWITTER_ID,
        clientSecret: process.env.AUTH_TWITTER_SECRET,
      }),
    );
  }
  return list;
}

async function syncUserFromToken(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      disabled: true,
      emailVerified: true,
      passwordHash: true,
    },
  });
}

/** Auth.js OAuth는 emailVerified:null로 생성함 → 이메일이 있으면 즉시 verified. */
function createAuthAdapter() {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    createUser: async (data: Parameters<NonNullable<typeof base.createUser>>[0]) => {
      const email = data.email?.trim().toLowerCase();
      return base.createUser!({
        ...data,
        ...(email
          ? { email, emailVerified: new Date() }
          : { emailVerified: null }),
      });
    },
  };
}

/**
 * Faith 인증 — Credentials + 소셜, Prisma, Resend 이메일 인증, Admin.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  adapter: createAuthAdapter(),
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30,
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!process.env.AUTH_SECRET?.trim()) {
            console.error("[auth] AUTH_SECRET missing");
            return null;
          }
          if (!process.env.DATABASE_URL?.trim()) {
            console.error("[auth] DATABASE_URL missing");
            return null;
          }

          const h = await headers();
          const ip =
            h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            h.get("x-real-ip")?.trim() ||
            "unknown";

          const email = String(credentials?.email ?? "")
            .trim()
            .toLowerCase();
          const password = String(credentials?.password ?? "");
          if (!isValidEmail(email) || !password) {
            throw new InvalidCredentials();
          }

          // IP + 이메일 단위 제한 (무차별 대입 완화)
          const ipLimit = rateLimit({
            key: `login:ip:${ip}`,
            limit: 10,
            windowMs: 60_000,
          });
          const emailLimit = rateLimit({
            key: `login:email:${email}`,
            limit: 8,
            windowMs: 15 * 60_000,
          });
          if (!ipLimit.ok || !emailLimit.ok) {
            console.warn("[auth] login rate limited", ip, email);
            throw new RateLimitedCredentials();
          }

          const user = await prisma.user.findUnique({
            where: { email },
            select: {
              id: true,
              email: true,
              name: true,
              image: true,
              role: true,
              disabled: true,
              passwordHash: true,
            },
          });
          if (!user || !user.passwordHash) {
            throw new InvalidCredentials();
          }
          if (user.disabled) {
            throw new DisabledCredentials();
          }
          const ok = await verifyPassword(password, user.passwordHash);
          if (!ok) {
            throw new InvalidCredentials();
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role,
            disabled: user.disabled,
          };
        } catch (err) {
          if (err instanceof CredentialsSignin) throw err;
          console.error("[auth] credentials authorize failed", err);
          throw new InvalidCredentials();
        }
      },
    }),
    ...oauthProviders(),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      const email = (user.email || "").trim().toLowerCase();

      // 동일 이메일이 이미 있으면, 그 계정에 연결된 소셜만 허용 (중복 가입 차단)
      if (account?.type === "oauth" && email) {
        const existing = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            passwordHash: true,
            accounts: {
              select: { provider: true, providerAccountId: true },
            },
          },
        });
        if (existing) {
          const alreadyLinked = existing.accounts.some(
            (a) =>
              a.provider === account.provider &&
              a.providerAccountId === account.providerAccountId,
          );
          if (!alreadyLinked) {
            return existing.passwordHash
              ? "/login?error=EmailConflict"
              : "/login?error=OAuthAccountNotLinked";
          }
        }
      }

      if (user.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { disabled: true, email: true, role: true },
        });
        if (dbUser?.disabled) return false;

        const e = (user.email || dbUser?.email || "").toLowerCase();
        if (e && adminEmails().includes(e) && dbUser?.role !== "ADMIN") {
          await prisma.user.update({
            where: { id: user.id },
            data: { role: "ADMIN" },
          });
        }
      }

      if (account?.type === "oauth" && !user.email) {
        return "/signup/email";
      }

      // 소셜+이메일은 즉시 verified. 신규 계정 생성은 adapter/createUser가 처리하고,
      // 기존 계정은 아래 jwt 콜백에서 보정한다.
      return true;
    },
    async jwt({ token, user, account, profile }) {
      if (user?.id) token.sub = user.id;
      if (account) {
        token.provider = account.provider;
        token.providerAccountId = account.providerAccountId;
      }
      if (profile) {
        const p = profile as {
          name?: string;
          email?: string | null;
          picture?: string;
          response?: { name?: string; email?: string; profile_image?: string };
        };
        const naver = p.response;
        token.name = naver?.name ?? p.name ?? token.name;
        token.email = naver?.email ?? p.email ?? token.email;
        token.picture = naver?.profile_image ?? p.picture ?? token.picture;
      }
      if (user?.email) {
        token.email = user.email.trim().toLowerCase();
      }

      try {
        const pending = (await cookies()).get("faith.pending-email")?.value;
        if (pending && !token.email) {
          token.email = pending.trim().toLowerCase();
        }
      } catch {
        /* ignore */
      }

      const oauthWithEmail = shouldAutoVerify(
        (account?.provider ?? token.provider) as string | undefined,
        (token.email ?? user?.email) as string | undefined,
      );

      // 매 요청 DB 동기화: 비활성화, 역할, 이메일 변경을 즉시 반영 (보안 목적).
      if (token.sub) {
        const dbUser = await syncUserFromToken(token.sub);
        if (dbUser) {
          token.email = dbUser.email ?? token.email;
          token.name = dbUser.name ?? token.name;
          token.picture = dbUser.image ?? token.picture;
          token.role = dbUser.role;
          token.disabled = dbUser.disabled;
          token.hasPassword = Boolean(dbUser.passwordHash);

          if (oauthWithEmail && !dbUser.emailVerified) {
            // Auth.js는 OAuth 유저를 null로 만들 수 있어 여기서 한 번 보정
            await ensureVerified(token.sub, false);
            token.emailVerified = true;
          } else {
            token.emailVerified = oauthWithEmail || Boolean(dbUser.emailVerified);
          }
        } else {
          token.emailVerified = oauthWithEmail;
          token.role = (token.role as Role | undefined) ?? ("USER" as Role);
        }
      } else {
        token.emailVerified = oauthWithEmail;
        token.role = "USER" as Role;
      }

      // 로그인 상태 유지 쿠키에 따라 JWT 수명 조절
      try {
        const remember = (await cookies()).get("faith.remember")?.value === "1";
        const maxAge = remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
        token.exp = Math.floor(Date.now() / 1000) + maxAge;
      } catch {
        /* ignore */
      }

      return token;
    },
    session({ session, token }) {
      session.user = {
        id: token.sub ?? "",
        name: (token.name as string | undefined) ?? session.user?.name ?? null,
        email:
          (token.email as string | undefined) ?? session.user?.email ?? null,
        image:
          (token.picture as string | undefined) ?? session.user?.image ?? null,
        emailVerified: Boolean(token.emailVerified),
        role: ((token.role as Role | undefined) ?? "USER") as Role,
        provider: token.provider as string | undefined,
        disabled: Boolean(token.disabled),
        hasPassword: Boolean(token.hasPassword),
      } as typeof session.user;
      return session;
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
    },
  },
  events: {
    // adapter.createUser는 OAuth 신규 가입에서만 호출됨 (이메일 가입은 API 직접 생성).
    // 관리자 이메일이면 승격. verified는 adapter/jwt에서 처리.
    async createUser({ user }) {
      const email = user.email?.trim().toLowerCase();
      if (!email || !user.id || !adminEmails().includes(email)) return;
      await prisma.user.update({
        where: { id: user.id },
        data: { role: "ADMIN" },
      });
    },
  },
});
