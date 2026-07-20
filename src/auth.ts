import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Naver from "next-auth/providers/naver";
import Twitter from "next-auth/providers/twitter";
import type { Role } from "@prisma/client";
import type { Provider } from "next-auth/providers";
import { cookies, headers } from "next/headers";

import { isValidEmail } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { isResendConfigured, sendVerificationEmail } from "@/lib/resend-mail";

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

/**
 * Faith 인증 — Credentials + 소셜, Prisma, Resend 이메일 인증, Admin.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  adapter: PrismaAdapter(prisma),
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
          const limited = rateLimit({
            key: `login:${ip}`,
            limit: 20,
            windowMs: 60_000,
          });
          if (!limited.ok) {
            console.warn("[auth] login rate limited", ip);
            return null;
          }

          const email = String(credentials?.email ?? "")
            .trim()
            .toLowerCase();
          const password = String(credentials?.password ?? "");
          if (!isValidEmail(email) || !password) return null;

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
          if (!user || user.disabled || !user.passwordHash) return null;
          const ok = await verifyPassword(password, user.passwordHash);
          if (!ok) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            image: user.image,
            role: user.role,
            disabled: user.disabled,
          };
        } catch (err) {
          console.error("[auth] credentials authorize failed", err);
          return null;
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

      // 동일 이메일에 비밀번호 계정이 있으면 새 OAuth 병합 거부
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
        if (existing?.passwordHash) {
          const alreadyLinked = existing.accounts.some(
            (a) =>
              a.provider === account.provider &&
              a.providerAccountId === account.providerAccountId,
          );
          if (!alreadyLinked) {
            return "/login?error=EmailConflict";
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
      return true;
    },
    async jwt({ token, user, account, profile, trigger }) {
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

      try {
        const pending = (await cookies()).get("faith.pending-email")?.value;
        if (pending && !token.email) {
          token.email = pending.trim().toLowerCase();
        }
      } catch {
        /* ignore */
      }

      if (token.sub && (trigger === "update" || trigger === "signIn" || !token.role)) {
        const dbUser = await syncUserFromToken(token.sub);
        if (dbUser) {
          token.email = dbUser.email ?? token.email;
          token.name = dbUser.name ?? token.name;
          token.picture = dbUser.image ?? token.picture;
          token.role = dbUser.role;
          token.emailVerified = Boolean(dbUser.emailVerified);
          token.disabled = dbUser.disabled;
          token.hasPassword = Boolean(dbUser.passwordHash);
        }
      } else if (token.sub) {
        // 매 요청 DB 동기화 (이메일/역할 변경 반영)
        const dbUser = await syncUserFromToken(token.sub);
        if (dbUser) {
          token.email = dbUser.email ?? token.email;
          token.name = dbUser.name ?? token.name;
          token.picture = dbUser.image ?? token.picture;
          token.role = dbUser.role;
          token.emailVerified = Boolean(dbUser.emailVerified);
          token.disabled = dbUser.disabled;
          token.hasPassword = Boolean(dbUser.passwordHash);
        }
      } else {
        token.emailVerified = false;
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
    async createUser({ user }) {
      const email = user.email?.trim().toLowerCase();
      if (email && adminEmails().includes(email)) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: "ADMIN" },
        });
      }
    },
    async signIn({ user, account }) {
      if (!account || account.type !== "oauth") return;
      if (!user.id) return;

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { email: true, emailVerified: true, name: true },
      });
      const email = dbUser?.email?.trim().toLowerCase();
      if (!email || dbUser?.emailVerified) return;

      if (!isResendConfigured()) {
        await prisma.user.update({
          where: { id: user.id },
          data: { emailVerified: new Date() },
        });
        return;
      }
      await sendVerificationEmail(email, dbUser?.name ?? user.name);
    },
  },
});
