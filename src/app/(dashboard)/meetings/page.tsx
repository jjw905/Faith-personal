import { redirect } from "next/navigation";

/** 회의 목록은 /dashboard(회의)로 통합. */
export default function MeetingsPage() {
  redirect("/dashboard");
}
