/** 히어로 배경 — 정지된 점 메쉬 그리드, 절제된 그레이 톤. */
export function VoiceStage() {
  return (
    <div className="absolute inset-0 isolate overflow-hidden bg-gradient-to-b from-[#f6f7f9] via-[#eef0f3] to-[#f6f7f9]">
      {/* 은은한 앰비언트 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/4 h-96 w-96 rounded-full bg-[#c7cbd3]/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-1/4 h-96 w-96 rounded-full bg-[#b9bec8]/25 blur-3xl"
      />
    </div>
  );
}
