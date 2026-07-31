import { redirect } from "next/navigation";

import { NewMeetingSetup } from "@/components/meetings/new-meeting-setup";
import { requireTeamFeatureUser } from "@/lib/team-feature-access";

export default async function TeamScheduleMeetingPage() {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) redirect("/dashboard");

  return (
    <NewMeetingSetup
      initialWorkspace="team"
      initialIntent="schedule"
      fixedIntent="schedule"
    />
  );
}
