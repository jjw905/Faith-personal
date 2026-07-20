import { ChangelogList } from "@/components/changelog/changelog-list";
import { PageContainer } from "@/components/layout/page-container";
import { requireAdmin } from "@/lib/admin";
import { DEV_AGENDA, getChangelogDateLabel } from "@/lib/changelog";

/** 개발전용. 개발안건 + Changelog. */
export default async function DevChangelogPage() {
  await requireAdmin();

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-8 sm:mb-10">
          <p className="text-xs font-semibold tracking-wide text-muted-2">
            개발전용
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Changelog
          </h1>
        </header>

        <section
          aria-labelledby="dev-agenda-heading"
          className="mb-12 border-b border-border pb-10 sm:mb-14 sm:pb-12"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2
              id="dev-agenda-heading"
              className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl"
            >
              오늘의 개발안건
            </h2>
            <p className="text-xs tabular-nums text-muted-2">
              {getChangelogDateLabel(DEV_AGENDA.date)}
            </p>
          </div>
          <ol className="mt-4 list-none space-y-2.5 border-l border-border pl-3.5">
            {DEV_AGENDA.items.map((item, index) => (
              <li
                key={item.label}
                className="flex gap-2.5 text-[15px] leading-[1.65] text-muted"
              >
                <span className="shrink-0 tabular-nums font-medium text-foreground/70">
                  {index + 1}.
                </span>
                <span className={item.done ? "text-muted-2 line-through" : ""}>
                  {item.label}
                </span>
                {item.done ? (
                  <span className="shrink-0 self-center rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-foreground/70">
                    완료
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <ChangelogList />
      </div>
    </PageContainer>
  );
}
