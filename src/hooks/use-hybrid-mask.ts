"use client";

import { useEffect, useRef, useState } from "react";

import type { MaskResult, MaskStyle } from "@/lib/masking/types";

type HybridResponse = MaskResult & {
  nerOk?: boolean;
  nerError?: string;
};

/**
 * 규칙+NER 하이브리드 마스킹 (서버 /api/mask).
 * 입력 변경 시 이전 결과를 즉시 버리고, 최신 text에 대한 응답만 채택.
 * (스페이스를 눌러야 갱신되던 stale 결과 버그 방지)
 */
export function useHybridMask(
  text: string,
  style: MaskStyle = "partial",
  debounceMs = 160,
) {
  const [result, setResult] = useState<HybridResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!text.trim()) {
      seqRef.current += 1;
      setResult(null);
      setLoading(false);
      return;
    }

    // 이전 NER/하이브리드 결과는 버림 → 호출측에서 규칙 폴백 즉시 표시
    setResult(null);
    setLoading(true);
    const seq = ++seqRef.current;

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/mask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, useNer: true, style }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as HybridResponse;
        if (seq !== seqRef.current) return;
        setResult({ ...data, original: text });
      } catch {
        if (seq === seqRef.current) setResult(null);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [text, style, debounceMs]);

  const fresh =
    result && result.original === text ? result : null;

  return { result: fresh, loading };
}
