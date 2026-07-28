/**
 * OWASP Email Cheat Sheet: disposable 도메인 남용 완화.
 * 완전 차단이 아니라 알려진 임시메일 도메인만 거절.
 * 목록은 필요 시 확장.
 */

const DISPOSABLE = new Set(
  [
    "10minutemail.com",
    "guerrillamail.com",
    "guerrillamail.net",
    "mailinator.com",
    "maildrop.cc",
    "tempmail.com",
    "temp-mail.org",
    "throwaway.email",
    "yopmail.com",
    "sharklasers.com",
    "trashmail.com",
    "getnada.com",
    "dispostable.com",
    "fakeinbox.com",
    "mailnesia.com",
    "mintemail.com",
    "moakt.com",
    "tempail.com",
    "emailondeck.com",
    "discard.email",
  ].map((d) => d.toLowerCase()),
);

export function isDisposableEmailDomain(email: string): boolean {
  const at = email.trim().toLowerCase().lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.trim().toLowerCase().slice(at + 1);
  if (!domain) return false;
  if (DISPOSABLE.has(domain)) return true;
  // 서브도메인 형태 mail.yopmail.com
  for (const d of DISPOSABLE) {
    if (domain.endsWith(`.${d}`)) return true;
  }
  return false;
}
