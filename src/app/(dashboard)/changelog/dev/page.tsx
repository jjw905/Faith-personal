import { DevChangelogEditor } from "@/components/changelog/dev-changelog-editor";
import { AdminPageChrome } from "@/components/admin/admin-page-chrome";
import { requireAdmin } from "@/lib/admin";
import { getDevChangelogState } from "@/lib/changelog-store";

/** 개발전용. 개발안건 + Changelog (어드민 편집). */
export default async function DevChangelogPage() {
  await requireAdmin();
  const state = await getDevChangelogState();

  return (
    <AdminPageChrome title="Changelog" maxWidth="max-w-3xl">
      <DevChangelogEditor initialState={state} />
    </AdminPageChrome>
  );
}
