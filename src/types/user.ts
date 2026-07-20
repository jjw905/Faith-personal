export type AccountTier = "FREE" | "PRO" | "ADMIN";

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  /** 계정 권한 등급 표시용 (ADMIN이면 등급 대신 ADMIN) */
  tier: AccountTier;
  rbacLevel: number;
  avatarInitials: string;
}
