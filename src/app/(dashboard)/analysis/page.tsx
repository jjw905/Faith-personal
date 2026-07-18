import { redirect } from "next/navigation";

/** 분석은 감사 로그로 통합. */
export default function AnalysisPage() {
  redirect("/audit");
}
