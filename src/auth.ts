import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Naver from "next-auth/providers/naver";
import Twitter from "next-auth/providers/twitter";

/**
 * Faith 소셜 로그인 (Auth.js v5).
 * 수집: provider, providerUserId, name, email(있을 때), image.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
    Naver({
      clientId: process.env.AUTH_NAVER_ID,
      clientSecret: process.env.AUTH_NAVER_SECRET,
    }),
    Twitter({
      clientId: process.env.AUTH_TWITTER_ID,
      clientSecret: process.env.AUTH_TWITTER_SECRET,
    }),
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    jwt({ token, account, profile }) {
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
        // 네이버는 response 안에 프로필이 옴
        const naver = p.response;
        token.name = naver?.name ?? p.name ?? token.name;
        token.email = naver?.email ?? p.email ?? token.email;
        token.picture = naver?.profile_image ?? p.picture ?? token.picture;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.name = (token.name as string | undefined) ?? session.user.name;
        session.user.email =
          (token.email as string | undefined) ?? session.user.email ?? undefined;
        session.user.image =
          (token.picture as string | undefined) ?? session.user.image;
      }
      return session;
    },
  },
  trustHost: true,
});
