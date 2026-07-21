import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Naver from "next-auth/providers/naver";
import Twitter from "next-auth/providers/twitter";
import type { Plan, Role } from "@prisma/client";
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
        // 이메일이 같아도 자동 병합하지 않음. 연동은 로그인 상태에서만.
        allowDangerousEmailAccountLinking: false,
      }),
    );
  }
  if (process.env.AUTH_NAVER_ID?.trim() && process.env.AUTH_NAVER_SECRET?.trim()) {
    list.push(
      Naver({
        clientId: process.env.AUTH_NAVER_ID,
        clientSecret: process.env.AUTH_NAVER_SECRET,
        // 네이버 email은 '연락처 이메일'이라 Gmail 등이 올 수 있음.
        // 외부 메일로 구글 계정과 자동 병합되지 않게 연결 끔.
        allowDangerousEmailAccountLinking: false,
        profile(profile) {
          const r = (profile as { response?: {
            id?: string;
            nickname?: string;
            name?: string;
            email?: string;
            profile_image?: string;
          } }).response;
          if (!r?.id) {
            throw new Error("네이버 프로필을 가져오지 못했습니다.");
          }
          // @naver.com 만 계정 키로 사용. 그 외(연락처 Gmail 등)는 이메일 미제공 취급
          // → /signup/email 에서 Faith용 이메일을 따로 받음.
          const raw = r.email?.trim().toLowerCase() ?? "";
          const naverMail = raw.endsWith("@naver.com") ? raw : null;
          return {
            id: r.id,
            name: r.name ?? r.nickname ?? null,
            email: naverMail,
            image: r.profile_image ?? null,
          };
        },
      }),
    );
  }
  if (process.env.AUTH_TWITTER_ID?.trim() && process.env.AUTH_TWITTER_SECRET?.trim()) {
    list.push(
      Twitter({
        clientId: process.env.AUTH_TWITTER_ID,
        clientSecret: process.env.AUTH_TWITTER_SECRET,
        allowDangerousEmailAccountLinking: false,
        // OAuth 2.0 + 이메일(가능하면). 없으면 /signup/email로 이어짐.
        authorization: {
          url: "https://x.com/i/oauth2/authorize",
          params: {
            scope: "users.read tweet.read offline.access users.email",
          },
        },
        userinfo: {
          url: "https://api.x.com/2/users/me",
          params: {
            "user.fields": "profile_image_url,confirmed_email",
          },
        },
        profile({ data }) {
          const d = data as {
            id: string;
            name?: string;
            username?: string;
            profile_image_url?: string;
            confirmed_email?: string | null;
          };
          return {
            id: d.id,
            name: d.name ?? d.username ?? null,
            email: d.confirmed_email ?? null,
            image: d.profile_image_url ?? null,
          };
        },
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
      plan: true,
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

/** signIn 콜백에서 세션 조회용 (NextAuth 초기화 후 주입). */
let getAuth: (() => Promise<{ user?: { id?: string } } | null>) | null =
  null;

/**
 * Faith 인증 — Credentials + 소셜, Prisma, Resend 이메일 인증, Admin.
 * 소셜은 제공자 ID로 식별. 이메일은 별도 등록. 추가 소셜은 로그인 후 연동.
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
      try {
        const email = (user.email || "").trim().toLowerCase();

        // 이메일이 이미 다른 계정에 있으면 자동 병합하지 않음.
        // 예외: 이미 이 소셜 ID가 연결된 경우(재로그인), 또는 로그인 상태에서 본인 계정에 연동.
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
              const session = getAuth ? await getAuth() : null;
              const sessionUserId = session?.user?.id;
              // 로그인 상태에서 본인 이메일과 같으면 연동 허용.
              if (sessionUserId === existing.id) {
                // ok — Auth.js가 현재 세션 유저에 provider 연결
              } else if (sessionUserId) {
                // 다른 계정의 이메일이면 연동 거부 (계정 탈취 방지)
                return "/account?error=EmailConflict";
              } else {
                return existing.passwordHash
                  ? "/login?error=EmailConflict"
                  : "/login?error=OAuthAccountNotLinked";
              }
            }
          }
        }

        // 신규 OAuth는 이 시점에 user.id가 제공자 ID(아직 DB cuid 아님).
        // DB에 없는 id로 update하면 예외 → Auth.js가 AccessDenied로 바꾼다.
        if (user.id) {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: { disabled: true, email: true, role: true },
          });
          if (dbUser) {
            if (dbUser.disabled) return false;

            const e = (user.email || dbUser.email || "").toLowerCase();
            if (e && adminEmails().includes(e) && dbUser.role !== "ADMIN") {
              await prisma.user.update({
                where: { id: user.id },
                data: { role: "ADMIN" },
              });
            }
          }
        }

        // 이메일 없는 소셜(네이버 연락처 Gmail 등)도 계정 생성 허용.
        // 이메일은 /signup/email 에서 등록 (layout이 유도).
        return true;
      } catch (err) {
        console.error("[auth] signIn callback failed", err);
        return "/login?error=Callback";
      }
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

      const oauthWithEmail = shouldAutoVerify(
        (account?.provider ?? token.provider) as string | undefined,
        (token.email ?? user?.email) as string | undefined,
      );

      // DB 동기화: 로그인 직후 또는 30초마다 (역할/비활성 반영, 매 요청 부하 완화)
      const DB_SYNC_TTL_MS = 30_000;
      const nowMs = Date.now();
      const forceSync = Boolean(user || account);
      const dueSync =
        forceSync ||
        !token.lastDbSync ||
        nowMs - Number(token.lastDbSync) >= DB_SYNC_TTL_MS;

      if (token.sub && dueSync) {
        const dbUser = await syncUserFromToken(token.sub);
        token.lastDbSync = nowMs;
        if (dbUser) {
          token.email = dbUser.email ?? token.email;
          token.name = dbUser.name ?? token.name;
          token.picture = dbUser.image ?? token.picture;
          token.role = dbUser.role;
          token.plan = dbUser.plan;
          token.disabled = dbUser.disabled;
          token.hasPassword = Boolean(dbUser.passwordHash);

          if (oauthWithEmail && !dbUser.emailVerified) {
            await ensureVerified(token.sub, false);
            token.emailVerified = true;
          } else {
            token.emailVerified = oauthWithEmail || Boolean(dbUser.emailVerified);
          }

          // ADMIN_EMAILS 승격은 계정 DB 이메일만 근거로 판단한다.
          const adminMail = dbUser.email?.trim().toLowerCase();
          if (
            adminMail &&
            adminEmails().includes(adminMail) &&
            dbUser.role !== "ADMIN"
          ) {
            await prisma.user.update({
              where: { id: token.sub },
              data: { role: "ADMIN" },
            });
            token.role = "ADMIN";
          }
        } else {
          token.emailVerified = oauthWithEmail;
          token.role = (token.role as Role | undefined) ?? ("USER" as Role);
          token.plan = (token.plan as Plan | undefined) ?? ("FREE" as Plan);
        }
      } else if (!token.sub) {
        token.emailVerified = oauthWithEmail;
        token.role = "USER" as Role;
        token.plan = "FREE" as Plan;
      } else if (oauthWithEmail && token.emailVerified !== true) {
        token.emailVerified = true;
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
        plan: ((token.plan as Plan | undefined) ?? "FREE") as Plan,
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

getAuth = auth;
