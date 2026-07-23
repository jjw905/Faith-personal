import { DevChangelogEditor } from "@/components/changelog/dev-changelog-editor";
import { PageContainer } from "@/components/layout/page-container";
import { requireAdmin } from "@/lib/admin";
import { getDevChangelogState } from "@/lib/changelog-store";

/** 개발전용. 개발안건 + Changelog (어드민 편집). */
export default async function DevChangelogPage() {
  await requireAdmin();
  const state = await getDevChangelogState();

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl">
        <DevChangelogEditor initialState={state} />
      </div>
    </PageContainer>
  );
}
