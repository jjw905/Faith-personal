/** 마스킹된 값 — 흐리게 처리한 회색 칩. */
function Masked({ children }: { children: React.ReactNode }) {
  return (
    <span className="mx-0.5 select-none rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[0.85em] text-muted-2 blur-[2.5px]">
      {children}
    </span>
  );
}

/** 채팅 한 줄 — 아바타, 이름, 시간, 말풍선. */
function MockMessage({
  initial,
  name,
  children,
}: {
  initial: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold text-foreground">{name}</span>
          <span className="text-[11px] text-muted-2">방금</span>
        </div>
        <div className="mt-1 inline-block rounded-2xl rounded-tl-md bg-surface px-3 py-2 text-sm text-foreground">
          {children}
        </div>
      </div>
    </div>
  );
}

/** 히어로 우측의 채팅 목업 카드. */
export function ChatMock() {
  return (
    <div className="rounded-3xl bg-card p-2 shadow-float">
      <div className="rounded-[1.35rem] bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-surface-2" />
            <span className="h-2.5 w-2.5 rounded-full bg-surface-2" />
            <span className="h-2.5 w-2.5 rounded-full bg-surface-2" />
          </div>
          <span className="text-xs font-medium text-muted-2">
            team-chat, 마스킹 ON
          </span>
        </div>

        <div className="space-y-4">
          <MockMessage initial="박" name="박지우">
            주민번호 <Masked>880419-*******</Masked> 확인 부탁드립니다.
          </MockMessage>
          <MockMessage initial="최" name="최민준">
            카드번호 <Masked>1681-****-****-5445</Masked> 결제완료.
          </MockMessage>
          <MockMessage initial="김" name="김서연">
            고객 연락처는 <Masked>010-****-6789</Masked> 입니다.
          </MockMessage>
          <MockMessage initial="이" name="이도현">
            메일은 <Masked>c**1@proton.me</Masked> 로 회신드릴게요.
          </MockMessage>
        </div>
      </div>
    </div>
  );
}
