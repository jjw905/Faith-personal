"use client";

import { ChangelogList } from "@/components/changelog/changelog-list";
import { PageContainer } from "@/components/layout/page-container";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { CHANGELOG, type ChangelogEntry } from "@/lib/changelog";

const EMPTY_CHANGELOG: ChangelogEntry[] = [];

/** 공통 메뉴용. ADMIN이어도 일반 사용자와 동일 화면. */
export default function ChangelogPage() {
  const { scenarioId } = usePageUxPreview();
  const entries =
    scenarioId === "empty"
      ? EMPTY_CHANGELOG
      : scenarioId === "full"
        ? CHANGELOG
        : CHANGELOG;

  return (
    <PageContainer className="bg-background">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-5 sm:mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Changelog
          </h1>
        </header>
        {entries.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-10 text-center text-base text-muted shadow-soft">
            표시할 변경 이력이 없습니다.
          </p>
        ) : (
          <ChangelogList entries={entries} />
        )}
      </div>
    </PageContainer>
  );
}
