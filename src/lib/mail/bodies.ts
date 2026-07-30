import { MAIL_BRAND } from "@/lib/mail/styles";
import { appUrl, escapeHtml, renderMailShell } from "@/lib/mail/shell";

const b = MAIL_BRAND;

/** 카드 본문: 안내 → 핵심 → 메타 */
function sections(introHtml: string, heroHtml: string, metaHtml: string) {
  return [text(introHtml), heroHtml, meta(metaHtml)].join("\n");
}

function text(html: string) {
  return `<p class="mail-text" style="margin:0;font-size:15px;line-height:1.65;color:${b.body}">${html}</p>`;
}

function meta(html: string) {
  return `<p class="mail-meta" style="margin:0;font-size:13px;line-height:1.5;color:${b.muted};text-align:center;min-height:1.5em">${html}</p>`;
}

function otpHero(code: string) {
  return `<p class="mail-hero mail-otp" style="margin:32px 0 16px;min-height:52px;padding:4px 4px 12px;font-size:28px;font-weight:700;letter-spacing:0.18em;text-align:center;color:${b.otpFg};background:transparent;border:none;border-bottom:3px solid ${b.otpLine};border-radius:0">${escapeHtml(code)}</p>`;
}

function buttonHero(href: string, label: string) {
  return `<p class="mail-hero mail-btn-wrap" style="margin:32px 0 16px;min-height:52px;text-align:center">
  <a class="mail-btn" href="${escapeHtml(href)}" style="display:inline-block;background:${b.primary};color:#ffffff;text-decoration:none;padding:14px 28px;min-height:48px;line-height:20px;border-radius:8px;font-size:15px;font-weight:600;text-align:center;box-sizing:border-box">${escapeHtml(label)}</a>
</p>`;
}

/** 가입 이메일 인증 OTP */
export function signupOtpEmailHtml(params: { code: string }) {
  return renderMailShell(
    "이메일 인증",
    sections(
      "Faith 가입을 계속하려면 아래 인증번호를 입력해 주세요.",
      otpHero(params.code),
      "인증번호는 10분 동안 유효합니다.",
    ),
  );
}

/** 계정 이메일 변경 OTP */
export function emailChangeOtpEmailHtml(params: { code: string }) {
  return renderMailShell(
    "이메일 변경 인증",
    sections(
      "계정 이메일을 변경하려면 아래 인증번호를 입력해 주세요.",
      otpHero(params.code),
      "인증번호는 10분 동안 유효합니다.",
    ),
  );
}

/** 비밀번호 재설정 링크 */
export function resetPasswordEmailHtml(params: { resetUrl: string }) {
  return renderMailShell(
    "비밀번호 재설정",
    sections(
      "아래 버튼으로 새 비밀번호를 설정해 주세요.",
      buttonHero(params.resetUrl, "비밀번호 재설정"),
      "링크는 10분 동안 유효합니다.",
    ),
  );
}

/** 가입 완료 환영 */
export function welcomeEmailHtml(params: { name?: string | null }) {
  const display = escapeHtml(params.name?.trim() || "회원");
  const loginUrl = `${appUrl()}/login`;
  return renderMailShell(
    "가입을 환영합니다",
    sections(
      `${display}님, Faith 계정이 준비되었습니다.`,
      buttonHero(loginUrl, "로그인하기"),
      "계정 정보는 설정에서 언제든 변경할 수 있습니다.",
    ),
  );
}

/**
 * 이미 계정이 있는 주소로 가입 OTP를 요청한 경우.
 * 가입 인증은 신규만 OTP로 끝냄. 여기선 로그인만 안내 (UI는 동일하게 "보냄").
 */
export function signupRequestNoticeEmailHtml() {
  const loginUrl = `${appUrl()}/login`;
  const forgotUrl = `${appUrl()}/forgot-password`;
  return renderMailShell(
    "로그인 안내",
    sections(
      "이 주소로 Faith 가입이 요청되었습니다.<br />아래에서 로그인해 주세요.",
      buttonHero(loginUrl, "로그인하기"),
      `비밀번호를 잊으셨다면 <a class="mail-link" href="${escapeHtml(forgotUrl)}" style="color:${b.primary}">비밀번호 찾기</a>를 이용해 주세요.`,
    ),
  );
}

/** OWASP: 이메일 변경 시 기존 주소에 알림 */
export function emailChangedNoticeEmailHtml(params: { newEmail: string }) {
  const settingsUrl = `${appUrl()}/settings`;
  return renderMailShell(
    "계정 이메일이 변경되었습니다",
    sections(
      `계정 로그인 이메일이 <strong>${escapeHtml(params.newEmail)}</strong> 로 변경되었습니다.<br />본인이 요청하지 않았다면 비밀번호를 바꾸고 고객지원에 문의해 주세요.`,
      buttonHero(settingsUrl, "계정 설정"),
      "계정 보호를 위해 이 안내를 보냅니다.",
    ),
  );
}

/** 하위 호환: 범용 OTP (제목/안내 직접 지정) */
export function otpEmailHtml(params: {
  title: string;
  intro: string;
  code: string;
}) {
  return renderMailShell(
    params.title,
    sections(
      escapeHtml(params.intro),
      otpHero(params.code),
      "인증번호는 10분 동안 유효합니다.",
    ),
  );
}

export { appUrl };
