"use client";

import dynamic from "next/dynamic";

const GlassChatBubblesPreview = dynamic(
  () =>
    import("@/components/marketing/glass-chat-bubbles").then(
      (m) => m.GlassChatBubblesPreview,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        유리 말풍선 로딩…
      </div>
    ),
  },
);

export function GlassBubblesClient() {
  return <GlassChatBubblesPreview />;
}
