"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  MAIL_SETUP,
  SUPPORT_EMAIL,
  buildSupportMailto,
  detectClientOs,
  type ClientOs,
} from "@/lib/support-email";
import { cn } from "@/lib/utils";

export function ContactMailPanel() {
  const [os, setOs] = useState<ClientOs>("other");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOs(detectClientOs());
  }, []);

  const mailto = useMemo(() => buildSupportMailto({ os }), [os]);
  const preferred: "mac" | "windows" =
    os === "windows" ? "windows" : "mac";

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-5 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild className="cursor-pointer gap-2">
          <a href={mailto}>
            <Mail className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            메일 보내기
            <ExternalLink
              className="h-3.5 w-3.5 opacity-70"
              strokeWidth={1.75}
              aria-hidden
            />
          </a>
        </Button>
        <Button
          type="button"
          variant="outline"
          className="cursor-pointer gap-2"
          onClick={copyAddress}
        >
          <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          {copied ? "복사됨" : SUPPORT_EMAIL}
        </Button>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground">앱이 안 열릴 때</p>
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
          {(["mac", "windows"] as const).map((key) => {
            const setup = MAIL_SETUP[key];
            const active = preferred === key;
            return (
              <section
                key={key}
                className={cn(
                  "rounded-xl border px-3.5 py-3",
                  active
                    ? "border-border-strong bg-surface"
                    : "border-border bg-card",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {setup.title}
                  </h3>
                  {active ? (
                    <span className="text-[11px] font-medium text-primary">
                      이 기기
                    </span>
                  ) : null}
                </div>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm leading-snug text-muted">
                  {setup.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
