import type { Role } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      /** Faith: 이메일 인증 완료 여부 (Date가 아닌 boolean) */
      emailVerified: boolean;
      role: Role;
      provider?: string;
      disabled?: boolean;
      hasPassword?: boolean;
    };
  }

  interface User {
    role?: Role;
    disabled?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    emailVerified?: boolean;
    role?: Role;
    provider?: string;
    providerAccountId?: string;
    picture?: string;
    disabled?: boolean;
    hasPassword?: boolean;
  }
}
