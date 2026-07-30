"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Gift, Loader2 } from "lucide-react";
import Link from "next/link";

import { authEnter, authEnterDelay } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  FEATURE_KEYS,
  FEATURE_LABELS,
  IMPROVEMENT_NOTE_MAX,
  PAYMENT_INTENT_LABELS,
  PAYMENT_INTENTS,
  PRICE_PREFERENCE_LABELS,
  PRICE_PREFERENCES,
  STT_SATISFACTION_LABELS,
  SURVEY_UNLOCKED_MONTHLY_MINUTES,
  notifySurveyCompleted,
  type FeatureKey,
  type PaymentIntent,
  type PricePreference,
} from "@/lib/stt/survey";
import { cn } from "@/lib/utils";

const SATISFACTION_SCALE = [1, 2, 3, 4, 5];

function OptionPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-12 w-full items-center gap-2 rounded-xl border px-4 text-base font-medium transition-colors",
        active
          ? "border-primary bg-primary-soft text-primary"
          : "border-border bg-card text-foreground hover:bg-surface-2",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2",
          active ? "border-primary bg-primary" : "border-border-strong",
        )}
      >
        {active ? <CheckCircle2 className="h-4 w-4 text-primary-foreground" /> : null}
      </span>
      <span className="flex-1 text-left">{children}</span>
    </button>
  );
}

export function SurveyForm({
  preview = false,
  previewCompleted = false,
  initialCompleted,
}: {
  /** 디자인 랩: API 없이 폼/완료 화면만. */
  preview?: boolean;
  previewCompleted?: boolean;
  /** 서버에서 이미 확인한 완료 여부. 있으면 재조회 없이 바로 반영(로딩 깜빡임 제거). */
  initialCompleted?: boolean;
} = {}) {
  const [loadingStatus, setLoadingStatus] = useState(
    !preview && initialCompleted === undefined,
  );
  const [completed, setCompleted] = useState(
    preview ? previewCompleted : Boolean(initialCompleted),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [paymentIntent, setPaymentIntent] = useState<PaymentIntent | null>(null);
  const [pricePreference, setPricePreference] = useState<PricePreference | null>(null);
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [features, setFeatures] = useState<Set<FeatureKey>>(new Set());
  const [note, setNote] = useState("");

  useEffect(() => {
    if (preview) {
      setLoadingStatus(false);
      setCompleted(previewCompleted);
      return;
    }
    if (initialCompleted !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/survey", { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; completed?: boolean };
        if (!cancelled && data.ok) setCompleted(Boolean(data.completed));
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preview, previewCompleted, initialCompleted]);

  const toggleFeature = useCallback((key: FeatureKey) => {
    setFeatures((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const showPrice = paymentIntent === "willing";
  const qSat = showPrice ? 3 : 2;
  const qFeat = showPrice ? 4 : 3;
  const qNote = showPrice ? 5 : 4;

  const canSubmit =
    paymentIntent !== null &&
    (paymentIntent !== "willing" || pricePreference !== null) &&
    satisfaction !== null &&
    features.size > 0;

  const submit = useCallback(async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    if (preview) {
      setCompleted(true);
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentIntent,
          pricePreference: paymentIntent === "willing" ? pricePreference : null,
          sttSatisfaction: satisfaction,
          featurePriorities: Array.from(features),
          improvementNote: note.trim() || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? "제출에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setCompleted(true);
      notifySurveyCompleted();
    } catch {
      setError("제출에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    submitting,
    preview,
    paymentIntent,
    pricePreference,
    satisfaction,
    features,
    note,
  ]);

  if (loadingStatus) {
    return (
      <div className="flex min-h-56 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  if (completed) {
    return (
      <Card className="overflow-hidden rounded-3xl shadow-soft ring-1 ring-border">
        <CardContent className="flex flex-col items-center gap-5 px-6 py-14 text-center sm:py-16">
          <div
            className={cn(
              "survey-gift-pop flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-primary",
            )}
          >
            <Gift className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </div>

          <div className={cn("space-y-1.5", authEnter, authEnterDelay(1))}>
            <p className="text-xl font-bold tracking-tight text-foreground">
              참여해 주셔서 감사합니다
            </p>
            <p className="max-w-sm text-base leading-relaxed text-muted">
              이번 주기 분석 가능 시간이{" "}
              <span className="font-semibold tabular-nums text-foreground">
                {SURVEY_UNLOCKED_MONTHLY_MINUTES}분
              </span>
              으로 늘었습니다.
            </p>
          </div>

          <Button
            asChild
            size="lg"
            className={cn(
              "h-12 w-full max-w-xs rounded-xl text-base font-semibold",
              authEnter,
              authEnterDelay(2),
            )}
          >
            <Link href="/plan">늘어난 시간 확인하기</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">
            1. 계속 이용한다면, 결제 의향이 있으신가요?
          </h2>
          <div className="flex flex-col gap-2">
            {PAYMENT_INTENTS.map((key) => (
              <OptionPill
                key={key}
                active={paymentIntent === key}
                onClick={() => {
                  setPaymentIntent(key);
                  if (key !== "willing") setPricePreference(null);
                }}
              >
                {PAYMENT_INTENT_LABELS[key]}
              </OptionPill>
            ))}
          </div>
        </div>
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
            showPrice ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
          aria-hidden={!showPrice}
          inert={!showPrice ? true : undefined}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="space-y-3 pt-6">
              <h2 className="text-lg font-semibold text-foreground">
                2. 합리적이라고 느끼는 월 요금대는 어느 쪽인가요?
              </h2>
              <div className="flex flex-col gap-2">
                {PRICE_PREFERENCES.map((key) => (
                  <OptionPill
                    key={key}
                    active={pricePreference === key}
                    onClick={() => setPricePreference(key)}
                  >
                    {PRICE_PREFERENCE_LABELS[key]}
                  </OptionPill>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          {qSat}. 받아쓰기(STT) 정확도에 얼마나 만족하시나요?
        </h2>
        <div className="grid grid-cols-5 gap-2">
          {SATISFACTION_SCALE.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSatisfaction(n)}
              aria-pressed={satisfaction === n}
              title={STT_SATISFACTION_LABELS[n]}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl border text-base font-semibold transition-colors",
                satisfaction === n
                  ? "border-primary bg-primary-soft text-primary"
                  : "border-border bg-card text-foreground hover:bg-surface-2",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="text-base text-muted">
          {satisfaction ? STT_SATISFACTION_LABELS[satisfaction] : "1(전혀 만족하지 않음) ~ 5(매우 만족)"}
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          {qFeat}. 다음 기능 중 가장 중요하다고 느끼신 기능을 모두 골라주세요
        </h2>
        <div className="flex flex-col gap-2">
          {FEATURE_KEYS.map((key) => (
            <OptionPill key={key} active={features.has(key)} onClick={() => toggleFeature(key)}>
              {FEATURE_LABELS[key]}
            </OptionPill>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">
          {qNote}. 더 개선되었으면 하는 점이 있다면 적어주세요 (선택)
        </h2>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, IMPROVEMENT_NOTE_MAX))}
          maxLength={IMPROVEMENT_NOTE_MAX}
          rows={4}
          placeholder="자유롭게 적어 주세요"
          className="w-full resize-none rounded-xl border border-border bg-card p-3 text-base text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-right text-base text-muted-2">
          {note.length}/{IMPROVEMENT_NOTE_MAX}
        </p>
      </section>

      {error ? <p className="text-base text-red-600">{error}</p> : null}

      <Button
        type="button"
        size="lg"
        disabled={!canSubmit || submitting}
        onClick={() => void submit()}
        className="h-14 w-full rounded-xl text-base font-semibold"
      >
        {submitting ? "제출하는 중" : "제출하고 분석 시간 늘리기"}
      </Button>
    </div>
  );
}
