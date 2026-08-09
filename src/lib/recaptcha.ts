/** Google reCAPTCHA v3 서버 검증. */

const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
/** 0.0~1.0. 낮을수록 봇 가능성. */
const DEFAULT_MIN_SCORE = 0.5;

/** 캡챠에 막혔을 때 사용자에게 보이는 단일 문구. */
export const RECAPTCHA_BLOCKED_MESSAGE = "요청을 처리할 수 없습니다.";

export type RecaptchaAction =
  | "login"
  | "signup_otp"
  | "forgot_password";

export function isRecaptchaConfigured() {
  return Boolean(
    process.env.RECAPTCHA_SECRET_KEY?.trim() &&
      process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim(),
  );
}

export function recaptchaSiteKey() {
  return process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() || "";
}

export async function verifyRecaptchaToken(params: {
  token: string | undefined | null;
  action: RecaptchaAction;
  minScore?: number;
}): Promise<{ ok: true; score?: number } | { ok: false; message: string }> {
  const secret = process.env.RECAPTCHA_SECRET_KEY?.trim();
  const site = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim();

  if (!secret || !site) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, message: RECAPTCHA_BLOCKED_MESSAGE };
    }
    return { ok: true };
  }

  const token = typeof params.token === "string" ? params.token.trim() : "";
  if (!token) {
    return { ok: false, message: RECAPTCHA_BLOCKED_MESSAGE };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = (await res.json()) as {
      success?: boolean;
      score?: number;
      action?: string;
      "error-codes"?: string[];
    };

    if (!data.success) {
      return { ok: false, message: RECAPTCHA_BLOCKED_MESSAGE };
    }

    if (data.action && data.action !== params.action) {
      return { ok: false, message: RECAPTCHA_BLOCKED_MESSAGE };
    }

    const min = params.minScore ?? DEFAULT_MIN_SCORE;
    const score = typeof data.score === "number" ? data.score : 0;
    if (score < min) {
      return { ok: false, message: RECAPTCHA_BLOCKED_MESSAGE };
    }

    return { ok: true, score };
  } catch {
    return { ok: false, message: RECAPTCHA_BLOCKED_MESSAGE };
  }
}
