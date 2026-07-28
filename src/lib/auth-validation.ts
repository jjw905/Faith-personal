/** 이메일 형식. 비교·저장 전 trim + lower-case (도메인·로컬 모두). */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * 인증용 이메일 정규화.
 * Gmail/Googlemail: 로컬 점 제거, +태그 제거, googlemail → gmail.
 */
export function normalizeAuthEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1) return trimmed;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") {
    const plus = local.indexOf("+");
    if (plus >= 0) local = local.slice(0, plus);
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

/**
 * 정확한 한글 이름.
 * 2~5자 완성형 한글만 허용 (공백, 영문, 숫자, 특수문자 불가).
 */
export function isValidKoreanName(value: string): boolean {
  return /^[가-힣]{2,5}$/.test(value.trim());
}

/**
 * 비밀번호 규칙 (OWASP ASVS + bcrypt 72바이트 제한):
 * - 8자 이상, 72자 이하
 * - 영문 대문자 / 소문자 / 특수문자 각 1자 이상
 * 표시 토큰은 AUTH_PASSWORD_HINT와 같은 한국어 라벨.
 */
export function getPasswordErrors(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 8) errors.push("8자 이상");
  if (password.length > 72) errors.push("72자 이하");
  if (!/[A-Z]/.test(password)) errors.push("대문자");
  if (!/[a-z]/.test(password)) errors.push("소문자");
  if (!/[!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|`~]/.test(password)) {
    errors.push("특수문자");
  }
  return errors;
}

export function isValidPassword(password: string): boolean {
  return getPasswordErrors(password).length === 0;
}
