"use server";

import { signIn } from "@/auth";

export type SocialProvider = "naver" | "google" | "twitter";

/** 소셜 OAuth 시작. UI의 x 버튼은 twitter 프로바이더로 연결. */
export async function signInWithProvider(provider: SocialProvider) {
  await signIn(provider, { redirectTo: "/dashboard" });
}
