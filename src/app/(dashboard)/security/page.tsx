import { redirect } from "next/navigation";

/** 보안 점검은 계정 알림 센터로 이동. */
export default function SecurityPage() {
  redirect("/account#notifications");
}
