import { PageContainer } from "@/components/layout/page-container";
import {
  CHANGELOG,
  DEV_AGENDA,
  getChangelogDateLabel,
  type ChangelogEntry,
} from "@/lib/changelog";
import { cn } from "@/lib/utils";

function EntryBlock({
  entry,
  isLast,
}: {
  entry: ChangelogEntry;
  isLast: boolean;
}) {
  return (
    <article
      className={cn(
        "grid gap-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-10",
        !isLast && "border-b border-border pb-12 sm:pb-14",
      )}
    >
      <aside className="sm:pt-1">
        <p className="text-sm font-semibold tabular-nums tracking-tight text-foreground">
          {getChangelogDateLabel(entry.date)}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-2">
          {entry.version}
        </p>
      </aside>

      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {entry.title}
        </h2>
        <p className="mt-2.5 max-w-2xl text-[15px] leading-[1.65] text-muted">
          {entry.summary}
        </p>

        <div className="mt-7 space-y-6">
          {entry.sections.map((section) => (
            <section key={section.title} className="max-w-2xl">
              <h3 className="text-sm font-semibold tracking-tight text-foreground">
                {section.title}
              </h3>
              {section.body ? (
                <p className="mt-1.5 text-sm leading-[1.65] text-muted">
                  {section.body}
                </p>
              ) : null}
              {section.items?.length ? (
                <ul className="mt-2 list-none space-y-1.5 border-l border-border pl-3.5">
                  {section.items.map((item) => (
                    <li
                      key={item}
                      className="text-sm leading-[1.65] text-muted"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}

export default function ChangelogPage() {
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
                key={item}
                className="flex gap-2.5 text-[15px] leading-[1.65] text-muted"
              >
                <span className="shrink-0 tabular-nums font-medium text-foreground/70">
                  {index + 1}.
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
        </section>

        <div className="space-y-12 sm:space-y-14">
          {CHANGELOG.map((entry, index) => (
            <EntryBlock
              key={entry.date}
              entry={entry}
              isLast={index === CHANGELOG.length - 1}
            />
          ))}
        </div>
      </div>
    </PageContainer>
  );
}
