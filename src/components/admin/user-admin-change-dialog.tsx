"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export type AdminChangeKind = "plan" | "role" | "suspend";

export type AdminChangeDraft = {
  userId: string;
  userLabel: string;
  kind: AdminChangeKind;
  title: string;
  summary: string;
  /** plan / role / disabled value to apply */
  value: string | boolean;
  needsAdminSecurity: boolean;
  needsPeriod: boolean;
};

type PeriodPreset = "week" | "month" | "year" | "custom";

const ADMIN_SECURITY_PHRASE = "관리자 변경";
const REASON_MIN_LENGTH = 15;

/** 같은 글자(특수문자 포함) 연속 입력 제거 */
function withoutConsecutiveSameChars(value: string): string {
  let out = "";
  for (const ch of value) {
    if (out.length > 0 && out[out.length - 1] === ch) continue;
    out += ch;
  }
  return out;
}

function isValidChangeReason(reason: string): boolean {
  const trimmed = reason.trim();
  if (trimmed.length < REASON_MIN_LENGTH) return false;
  return withoutConsecutiveSameChars(trimmed) === trimmed;
}

function addPeriod(base: Date, preset: PeriodPreset): Date {
  const d = new Date(base);
  if (preset === "week") {
    d.setDate(d.getDate() + 7);
    return d;
  }
  if (preset === "month") {
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  if (preset === "year") {
    d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  return d;
}

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function UserAdminChangeDialog({
  draft,
  pending,
  onCancel,
  onConfirm,
}: {
  draft: AdminChangeDraft | null;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: (payload: {
    reason: string;
    until: string | null;
    adminConfirm: string | null;
  }) => void;
}) {
  const [reason, setReason] = useState("");
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [customDate, setCustomDate] = useState("");
  const [adminConfirm, setAdminConfirm] = useState("");

  useEffect(() => {
    if (!draft) return;
    setReason("");
    setPreset("month");
    setCustomDate(toDateInputValue(addPeriod(new Date(), "month")));
    setAdminConfirm("");
  }, [draft]);

  const untilIso = useMemo(() => {
    if (!draft?.needsPeriod) return null;
    if (preset === "custom") {
      if (!customDate) return null;
      const end = new Date(`${customDate}T23:59:59`);
      if (Number.isNaN(end.getTime())) return null;
      return end.toISOString();
    }
    return addPeriod(new Date(), preset).toISOString();
  }, [draft?.needsPeriod, preset, customDate]);

  if (!draft) return null;

  const reasonOk = isValidChangeReason(reason);
  const periodOk = !draft.needsPeriod || Boolean(untilIso);
  const securityOk =
    !draft.needsAdminSecurity ||
    adminConfirm.trim() === ADMIN_SECURITY_PHRASE;
  const canSubmit = reasonOk && periodOk && securityOk && !pending;
  const suspendDanger =
    draft.kind === "suspend" && draft.value === true;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-change-title"
        className="w-full max-w-md max-h-[min(90dvh,44rem)] overflow-y-auto overscroll-y-contain rounded-2xl bg-background p-5 shadow-soft ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="admin-change-title"
          className="text-lg font-semibold text-foreground"
        >
          {draft.title}
        </h2>
        <p className="mt-1 text-base text-muted">{draft.userLabel}</p>
        <p className="mt-1 text-base text-muted-2">{draft.summary}</p>
        {draft.kind === "plan" && draft.value === "FREE" ? (
          <p className="mt-2 text-base text-muted">
            FREE로 내리면 즉시 확정되며, 기간 만료 후 자동 복원되지 않습니다.
          </p>
        ) : null}

        <label className="mt-4 block text-base font-medium text-foreground">
          사유
          <textarea
            value={reason}
            onChange={(e) =>
              setReason(withoutConsecutiveSameChars(e.target.value))
            }
            rows={3}
            placeholder="변경 사유를 입력하세요"
            className="mt-1.5 w-full resize-none rounded-xl bg-surface-2 px-3 py-2.5 text-base text-foreground outline-none placeholder:text-muted-2 focus:bg-[#dcdee4]"
          />
          <span className="mt-1.5 block text-sm font-normal text-muted">
            {reason.trim().length}/{REASON_MIN_LENGTH}자 이상
          </span>
        </label>

        {draft.needsPeriod ? (
          <div className="mt-4">
            <p className="text-base font-medium text-foreground">기간</p>
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="기간">
              {(
                [
                  { id: "week" as const, label: "1주" },
                  { id: "month" as const, label: "월" },
                  { id: "year" as const, label: "년" },
                  { id: "custom" as const, label: "직접" },
                ] as const
              ).map((item) => {
                const active = preset === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setPreset(item.id);
                      if (item.id !== "custom") {
                        setCustomDate(
                          toDateInputValue(addPeriod(new Date(), item.id)),
                        );
                      }
                    }}
                    className={cn(
                      "inline-flex h-8 items-center rounded-full px-3 text-base font-semibold transition-colors",
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted ring-1 ring-inset ring-border-strong hover:bg-surface hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            {preset === "custom" ? (
              <label className="mt-3 block text-base text-muted">
                종료일
                <input
                  type="date"
                  value={customDate}
                  min={toDateInputValue(new Date())}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="mt-1.5 block h-11 w-full rounded-xl bg-surface-2 px-3 text-base text-foreground outline-none focus:bg-[#dcdee4]"
                />
              </label>
            ) : (
              <p className="mt-2 text-base text-muted-2">
                {untilIso
                  ? `${new Date(untilIso).toLocaleDateString("ko-KR")}까지`
                  : ""}
              </p>
            )}
          </div>
        ) : null}

        {draft.needsAdminSecurity ? (
          <label className="mt-4 block text-base font-medium text-foreground">
            보안 확인
            <span className="mt-0.5 block text-base font-normal text-muted">
              「{ADMIN_SECURITY_PHRASE}」를 입력하세요
            </span>
            <input
              type="text"
              value={adminConfirm}
              onChange={(e) => setAdminConfirm(e.target.value)}
              autoComplete="off"
              className="mt-1.5 h-11 w-full rounded-xl bg-surface-2 px-3 text-base text-foreground outline-none focus:bg-[#dcdee4]"
            />
          </label>
        ) : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-muted ring-1 ring-inset ring-border-strong hover:bg-surface hover:text-foreground disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              onConfirm({
                reason: reason.trim(),
                until: untilIso,
                adminConfirm: draft.needsAdminSecurity
                  ? adminConfirm.trim()
                  : null,
              })
            }
            className={cn(
              "inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold disabled:opacity-40",
              suspendDanger
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-primary text-primary-foreground",
            )}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
