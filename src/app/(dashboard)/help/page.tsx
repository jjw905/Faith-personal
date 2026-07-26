"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import {
  DocsFloatChrome,
  DocsScrollTopFab,
  useDocsChromeGone,
  useDocsFloatBox,
} from "@/components/docs/docs-float-tools";
import {
  DocsDesktopToc,
  DocsMobileTocRail,
} from "@/components/docs/docs-mobile-toc-rail";
import { DocsSearchInput } from "@/components/docs/docs-search-input";
import { ContactMailPanel } from "@/components/help/contact-mail-panel";
import { PageContainer } from "@/components/layout/page-container";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  HELP_ARTICLES,
  HELP_NAV,
  searchHelpArticles,
  type HelpArticle,
} from "@/lib/help";
import {
  getScrollParent,
  scrollElementToCenter,
} from "@/lib/scroll-in-container";
import { cn } from "@/lib/utils";

function ArticleBlock({
  article,
  flashing,
}: {
  article: HelpArticle;
  flashing: boolean;
}) {
  return (
    <article
      id={article.id}
      className={cn(
        "-mx-2 rounded-xl px-2 py-2 sm:-mx-3 sm:px-3",
        flashing && "help-section-flash",
      )}
    >
      <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {article.title}
      </h2>
      <p className="mt-1.5 text-base leading-relaxed text-muted">
        {article.summary}
      </p>
      <div className="mt-4 space-y-2.5">
        {article.body.map((paragraph) => (
          <p
            key={paragraph}
            className="text-base leading-relaxed text-foreground/85"
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
  const { scenarioId } = usePageUxPreview();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(HELP_ARTICLES[0]?.id ?? "welcome");
  const [flashId, setFlashId] = useState<string | null>(null);

  const chromeRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const flashTimerRef = useRef<number | null>(null);

  const showFloatChrome = useDocsChromeGone(chromeRef);
  const floatBox = useDocsFloatBox(pageRef, showFloatChrome);

  const articles = scenarioId === "empty" ? [] : HELP_ARTICLES;
  const results = useMemo(
    () => (scenarioId === "empty" ? [] : searchHelpArticles(query)),
    [query, scenarioId],
  );
  const searching = query.trim().length > 0;

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/dashboard");
  }

  const focusArticle = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;

    setActiveId(id);
    scrollElementToCenter(el);
    window.history.replaceState(null, "", `#${id}`);

    if (flashTimerRef.current !== null) {
      window.clearTimeout(flashTimerRef.current);
    }
    setFlashId(null);
    window.requestAnimationFrame(() => {
      setFlashId(id);
      flashTimerRef.current = window.setTimeout(() => {
        setFlashId(null);
        flashTimerRef.current = null;
      }, 3000);
    });
  }, []);

  const onNavClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>, id: string) => {
      e.preventDefault();
      focusArticle(id);
    },
    [focusArticle],
  );

  useEffect(() => {
    return () => {
      if (flashTimerRef.current !== null) {
        window.clearTimeout(flashTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash || !articles.some((a) => a.id === hash)) return;
    const id = window.setTimeout(() => focusArticle(hash), 40);
    return () => window.clearTimeout(id);
  }, [focusArticle]);

  useEffect(() => {
    if (searching) return;

    const nodes = articles
      .map((article) => document.getElementById(article.id))
      .filter((node): node is HTMLElement => Boolean(node));

    if (nodes.length === 0) return;

    const scrollRoot = getScrollParent(nodes[0]!);
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
        root: scrollRoot,
        rootMargin: "-35% 0px -35% 0px",
        threshold: [0, 1],
      },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [searching, articles]);

  return (
    <PageContainer>
      <div ref={pageRef} className="relative mx-auto w-full max-w-5xl">
        <div ref={chromeRef} className="mb-8 sm:mb-10">
          <div className="mb-6">
            <button
              type="button"
              onClick={goBack}
              className="-ml-1 inline-flex cursor-pointer items-center gap-1.5 px-1 py-1 text-base font-semibold text-foreground transition-opacity hover:opacity-70"
            >
              <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
              돌아가기
            </button>
          </div>

          <header className="max-w-2xl">
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              도움말
            </h1>
            <div className="mt-5 max-w-md">
              <DocsSearchInput value={query} onChange={setQuery} id="help-search" />
            </div>
          </header>
        </div>

        {showFloatChrome && floatBox ? (
          <DocsFloatChrome
            left={floatBox.left}
            top={floatBox.top}
            query={query}
            onQueryChange={setQuery}
            onBack={goBack}
          />
        ) : null}

        <DocsScrollTopFab visible={showFloatChrome} pageRef={pageRef} />

        <DocsMobileTocRail
          ariaLabel="도움말 목차"
          activeId={activeId}
          onNavClick={onNavClick}
          emptyLabel={
            articles.length === 0
              ? "표시할 문서가 없습니다."
              : "일치하는 문서가 없습니다."
          }
          items={
            searching
              ? results.map((article) => ({
                  id: article.id,
                  title: article.title,
                }))
              : articles.length === 0
                ? []
                : HELP_NAV.flatMap((group) => group.items)
          }
        />

        <div className="flex flex-col gap-6 pb-32 md:flex-row md:gap-8 md:pb-0 lg:gap-12">
          <DocsDesktopToc
            ariaLabel="도움말 목차"
            stickyTopClass={showFloatChrome ? "md:top-20" : "md:top-4"}
          >
            {articles.length === 0 ? (
              <p className="px-2 py-2 text-base text-muted">
                표시할 문서가 없습니다.
              </p>
            ) : searching ? (
              <div className="space-y-1">
                <p className="px-2 text-sm font-semibold tracking-wide text-muted-2">
                  검색 결과
                </p>
                {results.length === 0 ? (
                  <p className="px-2 py-2 text-base text-muted">
                    일치하는 문서가 없습니다.
                  </p>
                ) : (
                  results.map((article) => (
                    <a
                      key={article.id}
                      href={`#${article.id}`}
                      onClick={(e) => onNavClick(e, article.id)}
                      className="block rounded-lg px-2 py-1.5 text-base text-muted transition-colors hover:bg-surface hover:text-foreground"
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
                    <p className="px-2 text-sm font-semibold tracking-wide text-muted-2">
                      {group.title}
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <a
                            href={`#${item.id}`}
                            onClick={(e) => onNavClick(e, item.id)}
                            className={cn(
                              "block rounded-lg px-2 py-1.5 text-base transition-colors",
                              activeId === item.id
                                ? "font-medium text-foreground"
                                : "text-muted hover:text-foreground",
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
          </DocsDesktopToc>

          <div className="min-w-0 flex-1">
            {articles.length === 0 ? (
              <p className="rounded-2xl bg-card px-4 py-10 text-center text-base text-muted shadow-soft">
                표시할 도움말 문서가 없습니다.
              </p>
            ) : searching && results.length === 0 ? (
              <p className="text-base text-muted">
                다른 검색어로 다시 시도해 보세요.
              </p>
            ) : (
              <div className="space-y-12 sm:space-y-14">
                {(searching ? results : articles).map(
                  (article, index, list) => (
                    <div
                      key={article.id}
                      className={cn(
                        index < list.length - 1 &&
                          "border-b border-border pb-12 sm:pb-14",
                      )}
                    >
                      <ArticleBlock
                        article={article}
                        flashing={flashId === article.id}
                      />
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
