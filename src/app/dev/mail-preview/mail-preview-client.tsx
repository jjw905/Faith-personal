"use client";

import { useMemo, useState } from "react";

import {
  MAIL_TEMPLATE_CATALOG,
  type MailTemplateId,
} from "@/lib/mail/catalog";
import { cn } from "@/lib/utils";

/** 로컬 전용. 트랜잭션 메일 템플릿 렌더 프리뷰. */
export function MailPreviewClient() {
  const [id, setId] = useState<MailTemplateId>(MAIL_TEMPLATE_CATALOG[0]!.id);
  const entry = useMemo(
    () => MAIL_TEMPLATE_CATALOG.find((t) => t.id === id) ?? MAIL_TEMPLATE_CATALOG[0]!,
    [id],
  );
  const html = useMemo(() => entry.render(), [entry]);

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row">
        <aside className="w-full shrink-0 space-y-3 lg:w-72">
          <header className="space-y-1">
            <p className="text-base font-semibold text-muted-2">로컬 미리보기</p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              메일 템플릿
            </h1>
            <p className="text-base text-muted">
              global CSS + 케이스별 HTML. 없는 케이스는 알려 주세요.
            </p>
          </header>

          <ul className="space-y-2">
            {MAIL_TEMPLATE_CATALOG.map((t) => {
              const active = t.id === entry.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setId(t.id)}
                    className={cn(
                      "flex min-h-12 w-full flex-col items-start rounded-xl border px-3 py-2 text-left transition-colors",
                      active
                        ? "border-foreground bg-surface"
                        : "border-border bg-card hover:bg-surface",
                    )}
                  >
                    <span className="text-base font-semibold text-foreground">
                      {t.label}
                    </span>
                    <span className="text-sm text-muted">{t.description}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="rounded-xl border border-border bg-card p-3 text-base text-muted">
            <p className="font-semibold text-foreground">Subject</p>
            <p className="mt-1 break-all">{entry.subject}</p>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            <iframe
              title={entry.label}
              srcDoc={html}
              className="h-[min(80vh,720px)] w-full border-0 bg-white"
            />
          </div>
        </section>
      </div>
    </div>
  );
}
