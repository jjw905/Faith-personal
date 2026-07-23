"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
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
  useDocsFloatBox,
} from "@/components/docs/docs-float-tools";
import { DocsSearchInput } from "@/components/docs/docs-search-input";
import { Container } from "@/components/marketing/container";
import {
  LEGAL_NAV,
  LEGAL_SECTIONS,
  searchLegalSections,
  type LegalSection,
} from "@/lib/legal";
import {
  getScrollParent,
  scrollElementToCenter,
} from "@/lib/scroll-in-container";
import { cn } from "@/lib/utils";

function SectionBlock({
  section,
  flashing,
}: {
  section: LegalSection;
  flashing: boolean;
}) {
  return (
    <section
      id={section.id}
      className={cn(
        "-mx-2 rounded-xl px-2 py-2 sm:-mx-3 sm:px-3",
        flashing && "help-section-flash",
      )}
    >
      <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {section.title}
      </h2>
      <ul className="mt-3 space-y-2">
        {section.items.map((item) => (
          <li
            key={item}
            className="relative pl-5 text-base leading-relaxed text-muted before:absolute before:left-0 before:top-2.5 before:h-1.5 before:w-1.5 before:rounded-full before:bg-border-strong"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LegalDocsView() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(LEGAL_SECTIONS[0]?.id ?? "collect");
  const [flashId, setFlashId] = useState<string | null>(null);

  const pageRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);
  const flashTimerRef = useRef<number | null>(null);
  const [showFloatChrome, setShowFloatChrome] = useState(false);

  const floatBox = useDocsFloatBox(pageRef, showFloatChrome);

  const syncFloatChrome = useCallback(() => {
    const chrome = chromeRef.current;
    if (!chrome) return;
    setShowFloatChrome(chrome.getBoundingClientRect().bottom < 12);
  }, []);

  useEffect(() => {
    window.addEventListener("resize", syncFloatChrome);
    syncFloatChrome();
    return () => window.removeEventListener("resize", syncFloatChrome);
  }, [syncFloatChrome]);

  const results = useMemo(() => searchLegalSections(query), [query]);
  const searching = query.trim().length > 0;

  function goBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  const focusSection = useCallback((id: string) => {
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
      focusSection(id);
    },
    [focusSection],
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
    if (!hash || !LEGAL_SECTIONS.some((s) => s.id === hash)) return;
    const id = window.setTimeout(() => focusSection(hash), 40);
    return () => window.clearTimeout(id);
  }, [focusSection]);

  useEffect(() => {
    if (searching) return;

    const nodes = LEGAL_SECTIONS.map((section) =>
      document.getElementById(section.id),
    ).filter((node): node is HTMLElement => Boolean(node));
    if (nodes.length === 0) return;

    const scrollRoot =
      getScrollParent(nodes[0]!) ?? scrollRef.current ?? undefined;
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
        root: scrollRoot ?? null,
        rootMargin: "-35% 0px -35% 0px",
        threshold: [0, 1],
      },
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [searching]);

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="shrink-0 border-b border-border/40">
        <Container className="flex h-16 items-center sm:h-[4.5rem]">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-foreground"
          >
            Faith
          </Link>
        </Container>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={syncFloatChrome}
      >
        <main className="py-10 sm:py-14">
          <Container>
            <div ref={pageRef} className="relative mx-auto w-full max-w-5xl pb-12">
              <div ref={chromeRef} className="mb-8 sm:mb-10">
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={goBack}
                    className="-ml-1 inline-flex cursor-pointer items-center gap-1.5 px-1 py-1 text-base font-semibold text-foreground transition-opacity hover:opacity-70"
                  >
                    <ArrowLeft
                      className="h-4 w-4"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                    돌아가기
                  </button>
                </div>

                <header className="max-w-2xl">
                  <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                    개인정보 처리방침, 이용약관
                  </h1>
                  <p className="mt-2 text-base text-muted">
                    시행일: 2026년 1월 1일
                  </p>
                  <div className="mt-5 max-w-md">
                    <DocsSearchInput
                      value={query}
                      onChange={setQuery}
                      id="legal-search"
                    />
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

              <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
                <aside className="lg:w-52 lg:shrink-0">
                  <nav
                    className={cn(
                      "lg:sticky",
                      showFloatChrome ? "lg:top-20" : "lg:top-4",
                    )}
                    aria-label="문서 목차"
                  >
                    {searching ? (
                      <div className="space-y-1">
                        <p className="px-2 text-sm font-semibold tracking-wide text-muted-2">
                          검색 결과
                        </p>
                        {results.length === 0 ? (
                          <p className="px-2 py-2 text-base text-muted">
                            일치하는 내용이 없습니다.
                          </p>
                        ) : (
                          results.map((section) => (
                            <a
                              key={section.id}
                              href={`#${section.id}`}
                              onClick={(e) => onNavClick(e, section.id)}
                              className="block rounded-lg px-2 py-1.5 text-base text-muted transition-colors hover:bg-surface hover:text-foreground"
                            >
                              {section.title}
                            </a>
                          ))
                        )}
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {LEGAL_NAV.map((group) => (
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
                      {(searching ? results : LEGAL_SECTIONS).map(
                        (section, index, list) => (
                          <div
                            key={section.id}
                            className={cn(
                              index < list.length - 1 &&
                                "border-b border-border/60 pb-12 sm:pb-14",
                            )}
                          >
                            <SectionBlock
                              section={section}
                              flashing={flashId === section.id}
                            />
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Container>
        </main>
      </div>
    </div>
  );
}
