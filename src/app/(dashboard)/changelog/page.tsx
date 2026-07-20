import { ChangelogList } from "@/components/changelog/changelog-list";
import { PageContainer } from "@/components/layout/page-container";

/** 공통 메뉴용. ADMIN이어도 일반 사용자와 동일 화면. */
export default function ChangelogPage() {
  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 sm:mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Changelog
          </h1>
        </header>
        <ChangelogList />
      </div>
    </PageContainer>
  );
}
