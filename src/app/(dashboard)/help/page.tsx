"use client";

import { ArrowLeft, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ContactMailPanel } from "@/components/help/contact-mail-panel";
import { PageContainer } from "@/components/layout/page-container";
import {
  HELP_ARTICLES,
  HELP_NAV,
  searchHelpArticles,
  type HelpArticle,
} from "@/lib/help";
import { cn } from "@/lib/utils";

function DocsSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative flex h-11 w-full items-center rounded-xl border border-border bg-card px-3 transition-colors focus-within:border-border-strong focus-within:bg-surface">
      <span className="sr-only">문서 검색</span>
      <Search
        className="h-4 w-4 shrink-0 text-muted"
        strokeWidth={1.75}
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="문서 검색..."
        className="min-w-0 flex-1 bg-transparent px-2.5 text-sm text-foreground outline-none placeholder:text-muted-2 [&::-webkit-search-cancel-button]:hidden"
        autoComplete="off"
        enterKeyHint="search"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
          aria-label="검색어 지우기"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </label>
  );
}

function ArticleBlock({ article }: { article: HelpArticle }) {
  return (
    <article id={article.id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {article.title}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted sm:text-[15px]">
        {article.summary}
      </p>
      <div className="mt-4 space-y-2.5">
        {article.body.map((paragraph) => (
          <p
            key={paragraph}
            className="text-sm leading-relaxed text-foreground/85 sm:text-[15px] sm:leading-[1.65]"
          >
            {paragraph}
          </p>
        ))}
      </div>
      {article.id === "contact" ? <ContactMailPanel /> : null}
    </article>
  );
}

export default function HelpPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(HELP_ARTICLES[0]?.id ?? "welcome");

  const results = useMemo(() => searchHelpArticles(query), [query]);
  const searching = query.trim().length > 0;

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  }

  useEffect(() => {
    if (searching) return;

    const nodes = HELP_ARTICLES.map((article) =>
      document.getElementById(article.id),
    ).filter((node): node is HTMLElement => Boolean(node));

    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (a, b) =>
              (a.boundingClientRect.top ?? 0) - (b.boundingClientRect.top ?? 0),
          );
        const top = visible[0]?.target.id;
        if (top) setActiveId(top);
      },
      {
        rootMargin: "-20% 0px -65% 0px",
        threshold: [0, 1],
      },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [searching]);

  return (
    <PageContainer className="!pb-12">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6">
          <button
            type="button"
            onClick={goBack}
            className="-ml-1 inline-flex cursor-pointer items-center gap-1.5 px-1 py-1 text-sm font-semibold text-foreground transition-opacity hover:opacity-70"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            돌아가기
          </button>
        </div>

        <header className="mb-8 max-w-2xl sm:mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            도움말
          </h1>
          <div className="mt-5 max-w-md">
            <DocsSearch value={query} onChange={setQuery} />
          </div>
        </header>

        <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
          <aside className="lg:w-52 lg:shrink-0">
            <nav
              className="lg:sticky lg:top-4"
              aria-label="도움말 목차"
            >
              {searching ? (
                <div className="space-y-1">
                  <p className="px-2 text-xs font-semibold tracking-wide text-muted-2">
                    검색 결과
                  </p>
                  {results.length === 0 ? (
                    <p className="px-2 py-2 text-sm text-muted">
                      일치하는 문서가 없습니다.
                    </p>
                  ) : (
                    results.map((article) => (
                      <a
                        key={article.id}
                        href={`#${article.id}`}
                        className="block rounded-lg px-2 py-1.5 text-sm text-muted transition-colors hover:bg-surface hover:text-foreground"
                      >
                        {article.title}
                      </a>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {HELP_NAV.map((group) => (
                    <div key={group.title}>
                      <p className="px-2 text-xs font-semibold tracking-wide text-muted-2">
                        {group.title}
                      </p>
                      <ul className="mt-1.5 space-y-0.5">
                        {group.items.map((item) => (
                          <li key={item.id}>
                            <a
                              href={`#${item.id}`}
                              onClick={() => setActiveId(item.id)}
                              className={cn(
                                "block rounded-lg px-2 py-1.5 text-sm transition-colors",
                                activeId === item.id
                                  ? "bg-surface font-medium text-foreground"
                                  : "text-muted hover:bg-surface/70 hover:text-foreground",
                              )}
                            >
                              {item.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </nav>
          </aside>

          <div className="min-w-0 flex-1">
            {searching && results.length === 0 ? (
              <p className="text-sm text-muted">
                다른 검색어로 다시 시도해 보세요.
              </p>
            ) : (
              <div className="space-y-12 sm:space-y-14">
                {(searching ? results : HELP_ARTICLES).map((article, index, list) => (
                  <div
                    key={article.id}
                    className={cn(
                      index < list.length - 1 &&
                        "border-b border-border pb-12 sm:pb-14",
                    )}
                  >
                    <ArticleBlock article={article} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
