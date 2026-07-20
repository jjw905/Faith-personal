import { NewMeetingSession } from "@/components/meetings/new-meeting-session";
import { requireAdmin } from "@/lib/admin";

export default async function NewMeetingPage() {
  await requireAdmin();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <NewMeetingSession />
    </div>
  );
}
