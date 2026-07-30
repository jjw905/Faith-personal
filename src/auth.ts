import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Naver from "next-auth/providers/naver";
import Twitter from "next-auth/providers/twitter";
import type { Plan, Role } from "@prisma/client";
import type { Provider } from "next-auth/providers";
import { cookies, headers } from "next/headers";

import { authEmailLookupOrder } from "@/lib/auth-store";
import {
  isValidEmail,
  normalizeAuthEmail,
} from "@/lib/auth-validation";
import { expireManualOverridesForUser } from "@/lib/admin-expire";
import { prisma } from "@/lib/prisma";
import { platformAdminEmails } from "@/lib/platform-admin";
import { verifyPassword } from "@/lib/password";
import {
  clientIpFromHeaders,
  durableRateLimit,
  durableResetRateLimit,
  hashRateLimitEmail,
} from "@/lib/rate-limit";
import { verifyRecaptchaToken } from "@/lib/recaptcha";

class InvalidCredentials extends CredentialsSignin {
  code = "invalid_credentials";
}
class RateLimitedCredentials extends CredentialsSignin {
  code = "rate_limited";
}
class DisabledCredentials extends CredentialsSignin {
  code = "disabled";
}
class UnverifiedEmailCredentials extends CredentialsSignin {
  code = "email_unverified";
}
class CaptchaFailedCredentials extends CredentialsSignin {
  code = "captcha_failed";
}

function adminEmails() {
  return platformAdminEmails();
}

/**
 * 네이버 로그인 임시 중단 스위치.
 *
 * UI 버튼만 지우면 /api/auth/signin/naver, /api/auth/callback/naver 가
 * 그대로 살아 있어 취약점이 된다. 여기서 provider 등록 자체를 막아야
 * 안전하게 끈 것이다. 재개할 때는 true로만 되돌리면 된다.
 */
export const NAVER_LOGIN_ENABLED = false;

function oauthProviders(): Provider[] {
  const list: Provider[] = [];
  if (
    process.env.AUTH_GOOGLE_ID?.trim() &&
    process.env.AUTH_GOOGLE_SECRET?.trim()
  ) {
    list.push(
      Google({
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
        // 이메일이 같아도 자동 병합하지 않음. 연동은 로그인 상태에서만.
        allowDangerousEmailAccountLinking: false,
      }),
    );
  }
  if (
    NAVER_LOGIN_ENABLED &&
    process.env.AUTH_NAVER_ID?.trim() &&
    process.env.AUTH_NAVER_SECRET?.trim()
  ) {
    list.push(
      Naver({
        clientId: process.env.AUTH_NAVER_ID,
        clientSecret: process.env.AUTH_NAVER_SECRET,
        // 네이버 email은 '연락처 이메일'이라 Gmail 등이 올 수 있음.
        // 외부 메일로 구글 계정과 자동 병합되지 않게 연결 끔.
        allowDangerousEmailAccountLinking: false,
        profile(profile) {
          const r = (
            profile as {
              response?: {
                id?: string;
                nickname?: string;
                name?: string;
                email?: string;
                profile_image?: string;
              };
            }
          ).response;
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
  if (
    process.env.AUTH_TWITTER_ID?.trim() &&
    process.env.AUTH_TWITTER_SECRET?.trim()
  ) {
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
  await expireManualOverridesForUser(userId);
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
      passwordHash: true,
    },
  });
}

/** Auth.js OAuth 사용자 생성 시 이메일을 정규화한다. */
function createAuthAdapter() {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    createUser: async (
      data: Parameters<NonNullable<typeof base.createUser>>[0],
    ) => {
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
let getAuth: (() => Promise<{ user?: { id?: string } } | null>) | null = null;

/**
 * Faith 인증 — Credentials + 소셜, Prisma, Admin.
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
        captchaToken: { label: "Captcha", type: "text" },
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
          const ip = clientIpFromHeaders(h);

          const email = normalizeAuthEmail(
            String(credentials?.email ?? ""),
          );
          const password = String(credentials?.password ?? "");
          const captchaToken = String(credentials?.captchaToken ?? "");
          if (!isValidEmail(email) || !password) {
            throw new InvalidCredentials();
          }

          const captcha = await verifyRecaptchaToken({
            token: captchaToken,
            action: "login",
          });
          if (!captcha.ok) {
            throw new CaptchaFailedCredentials();
          }

          const emailHash = hashRateLimitEmail(email);

          // IP + 이메일 해시 제한 (다중 인스턴스에서도 공유되도록 DB 백업 사용)
          const ipLimit = await durableRateLimit({
            key: `login:ip:${ip}`,
            limit: 8,
            windowMs: 15 * 60_000,
          });
          const emailLimit = await durableRateLimit({
            key: `login:email:${emailHash}`,
            limit: 5,
            windowMs: 15 * 60_000,
          });
          if (!ipLimit.ok || !emailLimit.ok) {
            console.warn("[auth] login rate limited", ip, emailHash);
            throw new RateLimitedCredentials();
          }

          const select = {
            id: true,
            email: true,
            name: true,
            image: true,
            role: true,
            disabled: true,
            passwordHash: true,
            emailVerified: true,
          } as const;
          let user = null as null | {
            id: string;
            email: string | null;
            name: string | null;
            image: string | null;
            role: Role;
            disabled: boolean;
            passwordHash: string | null;
            emailVerified: Date | null;
          };
          for (const candidate of authEmailLookupOrder(email)) {
            user = await prisma.user.findUnique({
              where: { email: candidate },
              select,
            });
            if (user) break;
          }
          if (!user || !user.passwordHash) {
            throw new InvalidCredentials();
          }
          await expireManualOverridesForUser(user.id);
          const fresh = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
              id: true,
              email: true,
              name: true,
              image: true,
              role: true,
              disabled: true,
              passwordHash: true,
              emailVerified: true,
            },
          });
          if (!fresh || !fresh.passwordHash) {
            throw new InvalidCredentials();
          }
          // OWASP: 비밀번호 검증 전에는 계정 상태(비활성·미인증)를 노출하지 않음
          const ok = await verifyPassword(password, fresh.passwordHash);
          if (!ok) {
            throw new InvalidCredentials();
          }
          if (fresh.disabled) {
            throw new DisabledCredentials();
          }
          if (!fresh.emailVerified) {
            throw new UnverifiedEmailCredentials();
          }

          await durableResetRateLimit(
            `login:ip:${ip}`,
            `login:email:${emailHash}`,
          );

          return {
            id: fresh.id,
            email: fresh.email,
            name: fresh.name,
            image: fresh.image,
            role: fresh.role,
            disabled: fresh.disabled,
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
            await expireManualOverridesForUser(user.id);
            const fresh = await prisma.user.findUnique({
              where: { id: user.id },
              select: { disabled: true, email: true, role: true },
            });
            if (!fresh || fresh.disabled) return false;

            const e = (user.email || fresh.email || "").toLowerCase();
            if (e && adminEmails().includes(e) && fresh.role !== "ADMIN") {
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
          // DB 행이 없으면 권한을 유지하지 않는다 (JWT ADMIN 잔존 방지)
          token.role = "USER" as Role;
          token.plan = "FREE" as Plan;
          token.disabled = true;
          token.hasPassword = false;
        }
      } else if (!token.sub) {
        token.role = "USER" as Role;
        token.plan = "FREE" as Plan;
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
    // 최초 소셜 연결 시 가입 기반 제공자 기록 (이후 연동은 덮어쓰지 않음).
    async linkAccount({ user, account }) {
      if (!user.id || !account?.provider) return;
      if (!["google", "naver", "twitter"].includes(account.provider)) return;
      await prisma.user.updateMany({
        where: { id: user.id, signupProvider: null },
        data: { signupProvider: account.provider },
      });
    },
  },
});

getAuth = auth;
