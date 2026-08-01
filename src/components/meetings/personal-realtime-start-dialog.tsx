"use client";

import { Search, UserPlus, X } from "lucide-react";
import { useEffect, useState } from "react";

import {
  PersonAvatar,
  displayPersonName,
} from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { PERSONAL_REALTIME_MAX_INVITEES } from "@/lib/realtime-policy";
import { cn } from "@/lib/utils";

type Person = {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
};

export function PersonalRealtimeStartDialog({
  open,
  title,
  saving,
  externalMessage,
  onClose,
  onSolo,
  onShared,
}: {
  open: boolean;
  title: string;
  saving?: boolean;
  externalMessage?: string;
  onClose: () => void;
  onSolo: () => void;
  onShared: (inviteeIds: string[]) => void;
}) {
  const [mode, setMode] = useState<"solo" | "shared">("solo");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open || mode !== "shared") return;
    const value = query.trim();
    if (value.length < 3) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void fetch(
        `/api/personal-realtime/people?query=${encodeURIComponent(value)}`,
        { cache: "no-store" },
      )
        .then(async (response) => {
          const data = (await response.json()) as {
            ok?: boolean;
            people?: Person[];
            message?: string;
          };
          if (cancelled) return;
          if (!response.ok || !data.ok) {
            setMessage(data.message ?? "회원을 검색하지 못했습니다.");
            setResults([]);
            return;
          }
          setMessage("");
          setResults(data.people ?? []);
        })
        .catch(() => {
          if (!cancelled) setMessage("회원을 검색하지 못했습니다.");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 240);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, open, query]);

  if (!open) return null;

  function resetDialog() {
    setMode("solo");
    setQuery("");
    setResults([]);
    setSelected([]);
    setMessage("");
  }

  function close() {
    if (!saving) {
      resetDialog();
      onClose();
    }
  }

  function addPerson(person: Person) {
    if (selected.some((item) => item.id === person.id)) return;
    if (selected.length >= PERSONAL_REALTIME_MAX_INVITEES) {
      setMessage("개인 공동 실시간은 본인 포함 최대 4명입니다.");
      return;
    }
    setSelected((current) => [...current, person]);
    setQuery("");
    setResults([]);
    setMessage("");
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={close}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="personal-realtime-start-title"
        className="w-full max-w-lg rounded-t-3xl bg-card p-5 shadow-float sm:rounded-3xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-primary">실시간 기록</p>
            <h2
              id="personal-realtime-start-title"
              className="mt-1 text-xl font-bold tracking-tight text-foreground"
            >
              어떻게 기록할까요?
            </h2>
            <p className="mt-2 text-base leading-6 text-muted">
              {title || "실시간 회의"} · 개인 기록
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-12 w-12 shrink-0 rounded-full"
            aria-label="실시간 기록 시작 닫기"
            onClick={close}
            disabled={saving}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            aria-pressed={mode === "solo"}
            className={cn(
              "min-h-24 rounded-2xl p-4 text-left ring-1 transition-colors",
              mode === "solo"
                ? "bg-primary text-primary-foreground ring-primary"
                : "bg-surface text-foreground ring-border hover:bg-surface-2",
            )}
            onClick={() => {
              setMode("solo");
              setQuery("");
              setResults([]);
              setMessage("");
            }}
          >
            <p className="text-lg font-semibold">나만 기록</p>
            <p
              className={cn(
                "mt-1 text-sm leading-5",
                mode === "solo" ? "text-primary-foreground/80" : "text-muted",
              )}
            >
              내 마이크만 받아쓰고 개인 회의록으로 저장합니다.
            </p>
          </button>
          <button
            type="button"
            aria-pressed={mode === "shared"}
            className={cn(
              "min-h-24 rounded-2xl p-4 text-left ring-1 transition-colors",
              mode === "shared"
                ? "bg-primary text-primary-foreground ring-primary"
                : "bg-surface text-foreground ring-border hover:bg-surface-2",
            )}
            onClick={() => {
              setMode("shared");
              setQuery("");
              setResults([]);
              setMessage("");
            }}
          >
            <p className="text-lg font-semibold">회원과 함께 기록</p>
            <p
              className={cn(
                "mt-1 text-sm leading-5",
                mode === "shared"
                  ? "text-primary-foreground/80"
                  : "text-muted",
              )}
            >
              음성 통화와 대화를 함께 기록합니다. 본인 포함 최대 4명입니다.
            </p>
          </button>
        </div>

        {mode === "shared" ? (
          <div className="mt-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-semibold text-foreground">
                초대할 회원
              </p>
              <span className="text-base tabular-nums text-muted">
                {selected.length}/{PERSONAL_REALTIME_MAX_INVITEES}
              </span>
            </div>
            <div className="relative mt-2">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted"
                aria-hidden
              />
              <input
                value={query}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  setQuery(nextQuery);
                  if (nextQuery.trim().length < 3) setResults([]);
                }}
                placeholder="핸들 또는 초대코드 검색"
                aria-label="초대할 회원 검색"
                className="min-h-12 w-full rounded-2xl border border-border bg-card pl-10 pr-4 text-base outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            {searching ? (
              <p className="mt-2 text-sm text-muted">검색 중...</p>
            ) : null}
            {results.length > 0 ? (
              <div className="mt-2 max-h-44 overflow-y-auto rounded-2xl bg-surface p-2">
                {results.map((person) => {
                  const name = displayPersonName(person.name, person.handle);
                  const alreadySelected = selected.some(
                    (item) => item.id === person.id,
                  );
                  return (
                    <button
                      key={person.id}
                      type="button"
                      disabled={alreadySelected}
                      className="flex min-h-12 w-full items-center gap-2 rounded-xl px-2 text-left text-base hover:bg-surface-2 disabled:opacity-45"
                      onClick={() => addPerson(person)}
                    >
                      <PersonAvatar name={name} size="sm" />
                      <span className="min-w-0 flex-1 truncate">{name}</span>
                      {person.handle ? (
                        <span className="shrink-0 text-sm text-muted">
                          @{person.handle}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
            {selected.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.map((person) => {
                  const name = displayPersonName(person.name, person.handle);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      className="inline-flex min-h-12 items-center gap-2 rounded-full border border-border bg-surface py-1.5 pl-1.5 pr-3 text-base font-medium"
                      onClick={() =>
                        setSelected((current) =>
                          current.filter((item) => item.id !== person.id),
                        )
                      }
                      aria-label={`${name} 초대 선택 해제`}
                    >
                      <PersonAvatar name={name} size="sm" />
                      <span className="max-w-[8rem] truncate">{name}</span>
                      <X className="h-4 w-4 text-muted" aria-hidden />
                    </button>
                  );
                })}
              </div>
            ) : null}
            <p className="mt-3 text-sm leading-5 text-muted">
              초대받은 회원은 알림에서 수락해야 입장할 수 있습니다. 호스트의 잔여
              시간에서 회의 시간만 한 번 사용됩니다.
            </p>
          </div>
        ) : null}

        {message || externalMessage ? (
          <p className="mt-4 text-base text-red-600" role="alert">
            {message || externalMessage}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="min-h-12 rounded-full px-5 text-base"
            onClick={close}
            disabled={saving}
          >
            취소
          </Button>
          <Button
            type="button"
            className="min-h-12 rounded-full px-5 text-base"
            onClick={() => {
              if (mode === "solo") {
                resetDialog();
                onSolo();
              } else {
                onShared(selected.map((p) => p.id));
              }
            }}
            disabled={saving || (mode === "shared" && selected.length === 0)}
          >
            <UserPlus className="h-5 w-5" aria-hidden />
            {saving
              ? "준비 중"
              : mode === "solo"
                ? "나만 기록 시작"
                : "초대하고 시작"}
          </Button>
        </div>
      </section>
    </div>
  );
}
