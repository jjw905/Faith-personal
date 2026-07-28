/** Google reCAPTCHA v3 서버 검증. */

const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
/** 0.0~1.0. 낮을수록 봇 가능성. */
const DEFAULT_MIN_SCORE = 0.5;

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
      return {
        ok: false,
        message: "보안 검증이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.",
      };
    }
    return { ok: true };
  }

  const token = typeof params.token === "string" ? params.token.trim() : "";
  if (!token) {
    return { ok: false, message: "보안 확인에 실패했습니다. 다시 시도해 주세요." };
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
      return {
        ok: false,
        message: "보안 확인에 실패했습니다. 다시 시도해 주세요.",
      };
    }

    if (data.action && data.action !== params.action) {
      return {
        ok: false,
        message: "보안 확인에 실패했습니다. 다시 시도해 주세요.",
      };
    }

    const min = params.minScore ?? DEFAULT_MIN_SCORE;
    const score = typeof data.score === "number" ? data.score : 0;
    if (score < min) {
      return {
        ok: false,
        message: "요청을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      };
    }

    return { ok: true, score };
  } catch {
    return {
      ok: false,
      message: "보안 확인 중 오류가 났습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}
