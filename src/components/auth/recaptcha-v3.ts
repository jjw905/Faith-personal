"use client";

import type { RecaptchaAction } from "@/lib/recaptcha";

type Grecaptcha = {
  ready: (cb: () => void) => void;
  execute: (siteKey: string, opts: { action: string }) => Promise<string>;
};

declare global {
  interface Window {
    grecaptcha?: Grecaptcha;
  }
}

const SCRIPT_ID = "google-recaptcha-v3";

function siteKey() {
  return process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() || "";
}

export function isRecaptchaClientConfigured() {
  return Boolean(siteKey());
}

function loadScript(key: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.grecaptcha) return Promise.resolve();
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("recaptcha")), {
        once: true,
      });
      if (window.grecaptcha) resolve();
    });
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.id = SCRIPT_ID;
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(key)}`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("recaptcha load failed"));
    document.head.appendChild(s);
  });
}

/** v3 토큰 발급. 키 없으면 null (개발에서 서버가 스킵). */
export async function getRecaptchaToken(
  action: RecaptchaAction,
): Promise<string | null> {
  const key = siteKey();
  if (!key) return null;

  await loadScript(key);
  const g = window.grecaptcha;
  if (!g) return null;

  return new Promise((resolve, reject) => {
    g.ready(() => {
      g.execute(key, { action })
        .then(resolve)
        .catch(reject);
    });
  });
}
