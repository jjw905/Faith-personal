"use client";

import { useMemo } from "react";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { buildSupportMailto } from "@/lib/support-email";

export function ContactMailPanel() {
  const mailto = useMemo(() => buildSupportMailto(), []);

  return (
    <div className="mt-5">
      <Button asChild className="cursor-pointer gap-2">
        <a href={mailto}>
          <Mail className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          메일 보내기
        </a>
      </Button>
    </div>
  );
}
