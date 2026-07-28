import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupEmailPageClient } from "@/components/auth/signup-email-page-client";

export const metadata = {
  title: "이메일 입력, Faith",
};

export default async function SignupEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user) {
    redirect("/signup");
  }
  if (session.user.email) {
    redirect("/dashboard");
  }

  return (
    <AuthShell contentAlign="raised">
      <SignupEmailPageClient initialError={params.error} />
    </AuthShell>
  );
}
