import { PageContainer } from "@/components/layout/page-container";
import {
  CHANGELOG,
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
    <article className="relative grid gap-6 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-10">
      <div className="sm:pt-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-col sm:items-start sm:gap-1.5">
          <span className="inline-flex rounded-md bg-surface px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground">
            {entry.version}
          </span>
          <p className="whitespace-nowrap text-xs text-muted-2">
            {getChangelogDateLabel(entry.date)}
          </p>
          <p className="text-xs text-muted-2">Changelog</p>
        </div>
      </div>

      <div
        className={cn(
          "relative border-l border-border pl-6 sm:border-l-0 sm:pl-0",
          !isLast && "pb-14 sm:pb-16",
        )}
      >
        <span
          className="absolute top-1.5 -left-[5px] h-2.5 w-2.5 rounded-full border-2 border-primary bg-card sm:hidden"
          aria-hidden
        />

        <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
          {entry.title}
        </h2>
        <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">
          {entry.summary}
        </p>

        <div className="mt-8 space-y-8">
          {entry.sections.map((section) => (
            <section key={section.title}>
              <h3 className="text-base font-semibold tracking-tight text-foreground">
                <span className="mr-1.5 font-normal text-muted-2">#</span>
                {section.title}
              </h3>
              {section.body ? (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                  {section.body}
                </p>
              ) : null}
              {section.items?.length ? (
                <ul className="mt-3 max-w-2xl space-y-2">
                  {section.items.map((item) => (
                    <li
                      key={item}
                      className="flex gap-2.5 text-sm leading-relaxed text-muted"
                    >
                      <span
                        className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-2"
                        aria-hidden
                      />
                      <span>{item}</span>
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
        <header className="mb-12 sm:mb-14">
          <p className="text-xs font-semibold tracking-wide text-muted-2">
            개발전용
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Changelog
          </h1>
        </header>

        <div className="relative">
          <div
            className="absolute top-2 bottom-8 left-[calc(9.5rem+1.25rem)] hidden w-px bg-border sm:block"
            aria-hidden
          />

          <div className="space-y-0">
            {CHANGELOG.map((entry, index) => (
              <div key={entry.version} className="relative">
                <span
                  className="absolute top-2 left-[calc(9.5rem+1.25rem-4px)] z-10 hidden h-2.5 w-2.5 rounded-full border-2 border-primary bg-card sm:block"
                  aria-hidden
                />
                <EntryBlock
                  entry={entry}
                  isLast={index === CHANGELOG.length - 1}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
