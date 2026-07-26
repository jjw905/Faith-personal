import { redirect } from "next/navigation";

import { NewMeetingSetup } from "@/components/meetings/new-meeting-setup";
import { requireUser } from "@/lib/require-user";

export default async function NewMeetingPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const session = await requireUser();
  if (!session) redirect("/login");
  const query = await searchParams;
  const initialWorkspace = query.workspace === "team" ? "team" : "personal";

  return <NewMeetingSetup initialWorkspace={initialWorkspace} />;
}
