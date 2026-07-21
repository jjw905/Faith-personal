import {
  CHANGELOG,
  getChangelogDateLabel,
  type ChangelogEntry,
} from "@/lib/changelog";
import { cn } from "@/lib/utils";

type ChangelogListProps = {
  entries?: ChangelogEntry[];
};

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

/** 기본은 사용자용 Changelog. 개발전용은 entries로 DEV_CHANGELOG 전달. */
export function ChangelogList({ entries = CHANGELOG }: ChangelogListProps) {
  return (
    <div className="space-y-12 sm:space-y-14">
      {entries.map((entry, index) => (
        <EntryBlock
          key={entry.date}
          entry={entry}
          isLast={index === entries.length - 1}
        />
      ))}
    </div>
  );
}
