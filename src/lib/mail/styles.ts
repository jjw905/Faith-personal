/**
 * Faith 트랜잭션 메일 공통 스타일.
 * 토큰은 `src/app/globals.css` :root 와 맞춤.
 * 바깥(가장 큰 섹션) 틴트 배경(--app-canvas 등)은 쓰지 않는다. 흰 바탕만.
 */
export const MAIL_GLOBAL_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1d1d1f;
    -webkit-text-size-adjust: 100%;
  }
  .mail-wrap {
    max-width: 520px;
    margin: 0 auto;
    padding: 40px 20px;
  }
  .mail-brand {
    margin: 0 0 16px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #11162e;
  }
  .mail-card {
    background: #ffffff;
    border: 1px solid #e2e2e7;
    border-radius: 12px;
    padding: 28px 24px;
    box-shadow: 0 2px 10px rgba(17, 22, 46, 0.08), 0 8px 24px rgba(17, 22, 46, 0.1);
  }
  .mail-title {
    margin: 0 0 12px;
    font-size: 20px;
    font-weight: 700;
    line-height: 1.35;
    letter-spacing: -0.02em;
    color: #1d1d1f;
  }
  .mail-text {
    margin: 0;
    font-size: 15px;
    line-height: 1.65;
    color: #515154;
  }
  .mail-text + .mail-text { margin-top: 12px; }
  .mail-hero {
    margin: 32px 0 16px;
    min-height: 52px;
    text-align: center;
  }
  .mail-otp {
    margin: 32px 0 16px;
    min-height: 52px;
    padding: 4px 4px 12px;
    font-size: 28px;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-align: center;
    color: #11162e;
    background: transparent;
    border: none;
    border-bottom: 3px solid #11162e;
    border-radius: 0;
  }
  .mail-meta {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: #6e6e73;
    text-align: center;
    min-height: 1.5em;
  }
  .mail-btn {
    display: inline-block;
    background: #11162e;
    color: #ffffff !important;
    text-decoration: none;
    padding: 14px 28px;
    min-height: 48px;
    line-height: 20px;
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    box-sizing: border-box;
  }
  .mail-btn-wrap {
    margin: 32px 0 16px;
    min-height: 52px;
    text-align: center;
  }
  .mail-link {
    color: #11162e;
    text-decoration: underline;
  }
  .mail-footer {
    margin: 24px 0 0;
    padding-top: 16px;
    border-top: 1px solid #e2e2e7;
  }
  .mail-footer-line {
    margin: 0;
    font-size: 11px;
    line-height: 1.55;
    color: #6e6e73;
  }
  .mail-footer-line + .mail-footer-line {
    margin-top: 4px;
  }
`;

/** `globals.css` 토큰 → 메일용 hex. 바깥 bg는 항상 흰색. */
export const MAIL_BRAND = {
  bg: "#ffffff",
  card: "#ffffff", // --card
  text: "#1d1d1f", // --foreground
  brand: "#11162e", // --primary
  body: "#515154", // --muted
  muted: "#6e6e73", // --muted-2
  footer: "#6e6e73", // --muted-2
  primary: "#11162e", // --primary
  border: "#e2e2e7", // --border
  otpFg: "#11162e", // --primary
  otpLine: "#11162e", // --primary
} as const;
