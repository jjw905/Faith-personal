import { redirect } from "next/navigation";

export default function SurveyStatsPage() {
  redirect("/stats?cat=survey");
}
