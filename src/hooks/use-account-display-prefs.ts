"use client";

import { useEffect, useState } from "react";

import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  DEFAULT_ACCOUNT_DISPLAY_PREFS,
  parseAccountDisplayPrefs,
  type AccountDisplayPrefs,
} from "@/lib/account-settings";

/**
 * 개인 회의 기록 기본값을 1회 조회. 디자인 미리보기(isLive=false)에서는
 * 조회하지 않고 기본값만 쓴다. `loaded`는 마스킹 초기값 시딩 등 1회성 반영에 쓴다.
 */
export function useAccountDisplayPrefs() {
  const { isLive } = usePageUxPreview();
  const [prefs, setPrefs] = useState<AccountDisplayPrefs>(
    DEFAULT_ACCOUNT_DISPLAY_PREFS,
  );
  const [loaded, setLoaded] = useState(!isLive);

  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/settings", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data?.ok) {
          setPrefs(parseAccountDisplayPrefs(data));
        }
      } catch {
        // 실패해도 기본값으로 진행
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLive]);

  return { ...prefs, loaded };
}
