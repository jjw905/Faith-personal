/** 기능 섹션 헤드라인 옆 유리 말풍선 — 히어로 우측 열과 비율 맞춤. */
export function HeroChatShapes() {
  return (
    <div
      aria-hidden
      className="pointer-events-none relative z-10 w-[11rem] select-none sm:w-[13rem] xl:w-[15rem]"
    >
      <img
        src="/hero-chat-glass-01.png"
        alt=""
        width={533}
        height={619}
        draggable={false}
        className="hero-chat-glass h-auto w-full"
      />
    </div>
  );
}
