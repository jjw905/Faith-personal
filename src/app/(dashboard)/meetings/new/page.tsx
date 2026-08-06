import { redirect } from "next/navigation";

import { NewMeetingSetup } from "@/components/meetings/new-meeting-setup";
import { requireTeamFeatureUser } from "@/lib/team-feature-access";
import { requireUser } from "@/lib/require-user";

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{
    workspace?: string;
    intent?: string;
    mode?: string;
  }>;
}) {
  const session = await requireUser();
  if (!session) redirect("/login");
  const query = await searchParams;
  const initialWorkspace = query.workspace === "team" ? "team" : "personal";
  const liveMode = query.mode === "live";
  const teamIntent =
    query.intent === "schedule"
      ? ("schedule" as const)
      : query.intent === "start"
        ? ("start" as const)
        : undefined;
  if (initialWorkspace === "team") {
    const gate = await requireTeamFeatureUser();
    if (!gate.ok) redirect("/meetings/new");
  }

  return (
    <NewMeetingSetup
      initialWorkspace={initialWorkspace}
      initialIntent={teamIntent}
      fixedIntent={initialWorkspace === "team" ? teamIntent : undefined}
      liveMode={liveMode}
    />
  );
}
