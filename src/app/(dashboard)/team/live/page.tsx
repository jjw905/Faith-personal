import { redirect } from "next/navigation";

import { NewMeetingSetup } from "@/components/meetings/new-meeting-setup";
import { requireTeamFeatureUser } from "@/lib/team-feature-access";

export default async function TeamLiveMeetingPage() {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) redirect("/dashboard");

  return (
    <NewMeetingSetup
      initialWorkspace="team"
      initialIntent="start"
      fixedIntent="start"
    />
  );
}
