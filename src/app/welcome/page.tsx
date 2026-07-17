import { redirect } from "next/navigation";

/** 구 경로 호환 — 루트 메인으로 이동. */
export default function WelcomeRedirectPage() {
  redirect("/");
}
