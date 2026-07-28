import { MAIL_BRAND, MAIL_GLOBAL_CSS } from "@/lib/mail/styles";

export function appUrl() {
  return (
    process.env.AUTH_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3000"
  );
}

/** 프로덕션에서 메일 CTA가 localhost로 나가지 않게. */
export function isMailAppUrlSafe() {
  if (process.env.NODE_ENV !== "production") return true;
  const base = appUrl();
  try {
    const host = new URL(base).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** 공통 메일 셸 + global CSS. */
export function renderMailShell(title: string, bodyHtml: string) {
  const b = MAIL_BRAND;
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(title)}</title>
  <style>${MAIL_GLOBAL_CSS}</style>
</head>
<body style="margin:0;padding:0;background:${b.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${b.text}">
  <div class="mail-wrap" style="max-width:520px;margin:0 auto;padding:40px 20px">
    <p class="mail-brand" style="margin:0 0 16px;font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${b.brand}">Faith</p>
    <div class="mail-card" style="background:${b.card};border:1px solid ${b.border};border-radius:12px;padding:28px 24px;box-shadow:0 2px 10px rgba(17,22,46,0.08),0 8px 24px rgba(17,22,46,0.1)">
      <h1 class="mail-title" style="margin:0 0 12px;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${b.text}">${escapeHtml(title)}</h1>
      ${bodyHtml}
    </div>
    <div class="mail-footer" style="margin:24px 0 0;padding-top:16px;border-top:1px solid ${b.border}">
      <p class="mail-footer-line" style="margin:0;font-size:11px;line-height:1.55;color:${b.footer}">본 메일은 Faith 계정 관련 안내입니다.</p>
      <p class="mail-footer-line" style="margin:4px 0 0;font-size:11px;line-height:1.55;color:${b.footer}">직접 요청하지 않았다면 비밀번호를 확인하고, 계정 설정에서 최근 활동을 점검해 주세요.</p>
    </div>
  </div>
</body>
</html>`;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
