/** 이메일 형식 */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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
 */
export function getPasswordErrors(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 8) errors.push("8자 이상");
  if (password.length > 72) errors.push("72자 이하");
  if (!/[A-Z]/.test(password)) errors.push("영문 대문자 1자 이상");
  if (!/[a-z]/.test(password)) errors.push("영문 소문자 1자 이상");
  if (!/[!@#$%^&*()_\-+=[\]{};:'",.<>/?\\|`~]/.test(password)) {
    errors.push("특수문자 1자 이상");
  }
  return errors;
}

export function isValidPassword(password: string): boolean {
  return getPasswordErrors(password).length === 0;
}
