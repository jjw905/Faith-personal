import { auth } from "@/auth";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  if (session.user.disabled) return null;
  if (session.user.mfaEnabled && !session.user.mfaVerified) return null;
  return session;
}
