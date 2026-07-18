/** 서버 프로세스 동안 유지되는 가입 이메일 목록 (데모용). */
const registeredEmails = new Set<string>([
  "demo@faith.app",
  "admin@faith.app",
]);

export function registerEmail(email: string) {
  registeredEmails.add(email.trim().toLowerCase());
}

export function isEmailTaken(email: string) {
  return registeredEmails.has(email.trim().toLowerCase());
}
