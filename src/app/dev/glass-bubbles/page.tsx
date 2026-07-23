import dynamic from "next/dynamic";
import Image from "next/image";

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

/** 유리 질감 3D 말풍선 로컬 프리뷰 (포트 3001 권장). */
export default function GlassBubblesDevPage() {
  return (
    <main className="min-h-dvh bg-[#e8eaee] text-zinc-800">
      <div className="mx-auto grid min-h-dvh max-w-6xl gap-6 p-6 lg:grid-cols-2 lg:gap-8 lg:p-10">
        <section className="flex flex-col gap-3">
          <h1 className="text-lg font-semibold tracking-tight">참고 이미지</h1>
          <div className="relative min-h-[420px] flex-1 overflow-hidden rounded-3xl bg-[#eceef2] ring-1 ring-black/5">
            <Image
              src="/dev/glass-bubbles-ref.png"
              alt="유리 말풍선 참고"
              fill
              className="object-contain p-6"
              priority
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h1 className="text-lg font-semibold tracking-tight">WebGL 프리뷰</h1>
          <div className="min-h-[420px] flex-1 overflow-hidden rounded-3xl bg-[#e8eaee] ring-1 ring-black/5">
            <GlassChatBubblesPreview />
          </div>
          <p className="text-xs text-zinc-500">
            MeshTransmissionMaterial · 두께/굴절/하이라이트 조정용 페이지
          </p>
        </section>
      </div>
    </main>
  );
}
