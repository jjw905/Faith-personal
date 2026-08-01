import type { Plan, Role } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
      plan: Plan;
      provider?: string;
      disabled?: boolean;
      hasPassword?: boolean;
      mfaEnabled?: boolean;
      mfaVerified?: boolean;
    };
  }

  interface User {
    role?: Role;
    plan?: Plan;
    disabled?: boolean;
    mfaEnabled?: boolean;
    mfaVersion?: number;
    mfaVerified?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    plan?: Plan;
    provider?: string;
    providerAccountId?: string;
    picture?: string;
    disabled?: boolean;
    hasPassword?: boolean;
    mfaEnabled?: boolean;
    mfaVersion?: number;
    mfaVerified?: boolean;
    mfaVerifiedVersion?: number;
    /** 마지막 DB 동기화 epoch ms */
    lastDbSync?: number;
  }
}
