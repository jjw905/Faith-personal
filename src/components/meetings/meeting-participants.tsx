import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import type { Participant } from "@/types/meeting";
import { cn } from "@/lib/utils";

type PersonKind = "member" | "guest" | "voice";

const KIND_ORDER: PersonKind[] = ["member", "guest", "voice"];

const KIND_LABEL: Record<PersonKind, string> = {
  member: "회원",
  guest: "게스트",
  voice: "화자",
};

function personKind(p: Participant): PersonKind {
  if (p.recognition === "guest") return "guest";
  if (p.recognition === "voice") return "voice";
  if (p.recognition === "member" || p.isMember === true) return "member";
  return "voice";
}

function groupParticipants(participants: Participant[]) {
  return KIND_ORDER.map((kind) => ({
    kind,
    people: participants.filter((p) => personKind(p) === kind),
  })).filter((g) => g.people.length > 0);
}

function PeopleRow({ people }: { people: Participant[] }) {
  return (
    <ul className="flex min-w-0 flex-wrap gap-x-3 gap-y-2.5">
      {people.map((p) => (
        <li
          key={p.id}
          className="inline-flex h-8 max-w-full items-center gap-2"
          title={p.recognitionNote || undefined}
        >
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback
              className={cn(
                "text-xs font-semibold leading-none text-white",
                p.color,
              )}
            >
              {p.initials}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-[6rem] truncate text-sm font-medium leading-none text-foreground">
            {p.name}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * 종류 = 왼쪽 비교 축, 사람 = 오른쪽.
 * 종류가 하나뿐이면 축을 생략해 참석 N / 화자 N 이중 표기를 피함.
 */
export function GroupedParticipantsList({
  participants,
  className,
}: {
  participants: Participant[];
  className?: string;
}) {
  if (participants.length === 0) return null;

  const grouped = groupParticipants(participants);

  if (grouped.length === 1) {
    return (
      <div className={className}>
        <PeopleRow people={grouped[0].people} />
      </div>
    );
  }

  return (
    <ul className={cn("space-y-5", className)}>
      {grouped.map(({ kind, people }) => (
        <li key={kind} className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-muted">
            {KIND_LABEL[kind]}
            <span className="ml-1.5 tabular-nums">{people.length}</span>
          </p>
          <PeopleRow people={people} />
        </li>
      ))}
    </ul>
  );
}

/** 회의 상세용 참석. 요약 블록과 같은 좌측·패딩 기준. */
export function MeetingParticipants({
  participants,
}: {
  participants: Participant[];
}) {
  if (participants.length === 0) return null;

  return (
    <section
      className="rounded-2xl bg-surface px-4 py-4 sm:px-5"
      aria-label={`참석자 ${participants.length}명`}
    >
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-[11px] font-semibold tracking-wide text-muted-2">
          참석
        </h2>
        <span className="text-[11px] font-semibold tabular-nums text-muted-2">
          {participants.length}
        </span>
      </div>
      <GroupedParticipantsList participants={participants} />
    </section>
  );
}
