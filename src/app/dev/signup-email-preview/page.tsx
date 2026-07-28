import { notFound } from "next/navigation";

import { SignupEmailPreviewClient } from "@/app/dev/signup-email-preview/signup-email-preview-client";

/** 로컬 전용. 회원가입 이메일 인증 UX. */
export default function SignupEmailPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SignupEmailPreviewClient />;
}
