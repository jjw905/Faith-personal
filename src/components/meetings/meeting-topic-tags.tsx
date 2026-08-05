import { cn } from "@/lib/utils";

/**
 * 주제 키워드: 칩 배경 없이 `#태그`.
 * 여러 개일 때 #과 본문 대비·간격으로 시인성 유지.
 */
export function MeetingTopicTags({
  tags,
  className,
  overflow = 0,
}: {
  tags: string[];
  className?: string;
  /** 목록에서 잘린 개수 (+N) */
  overflow?: number;
}) {
  if (tags.length === 0) return null;

  const full = [
    ...tags.map((tag) => `#${tag}`),
    overflow > 0 ? `+${overflow}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ul
      className={cn(
        "flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1",
        className,
      )}
      title={full}
      aria-label={full}
    >
      {tags.map((tag) => (
        <li
          key={tag}
          className="inline-flex max-w-[11rem] items-baseline text-base leading-5 tracking-tight"
        >
          <span className="shrink-0 text-muted-2" aria-hidden>
            #
          </span>
          <span className="truncate text-muted">{tag}</span>
        </li>
      ))}
      {overflow > 0 ? (
        <li className="shrink-0 text-base leading-5 text-muted-2">
          +{overflow}
        </li>
      ) : null}
    </ul>
  );
}
