/**
 * 인증 UX 문구.
 * 존재 여부를 드러내는 조건문(“가입된 이메일이면…” 등)은 쓰지 않음.
 * 서버·클라이언트 동일 문구로 통일 응답 유지.
 */

/** 가입 OTP / 이메일 변경 OTP 요청 성공 */
export const AUTH_MAIL_CHECK = "메일을 확인해 주세요.";

/** 비밀번호 재설정 요청 성공 (존재 여부와 무관) */
export const AUTH_RESET_CHECK = "메일을 확인해 주세요.";

/** 재설정 완료 화면 보조 문구 */
export const AUTH_RESET_CHECK_HINT =
  "메일이 없으면 스팸함을 확인하거나, 잠시 후 다시 시도해 주세요.";

/** 메일 서비스 비가동 */
export const AUTH_MAIL_UNAVAILABLE =
  "지금은 메일을 보낼 수 없습니다. 잠시 후 다시 시도해 주세요.";

/**
 * 비밀번호 규칙 짧은 힌트 (필드 안내·placeholder·서버 노출).
 * 업계 패턴: 길이 먼저 + 문자 종류를 `/`로 나열 + "포함"
 * (Apple "eight or more… including…", Cafe24/벅스 "8자… 대소문자/…", Shopify details).
 */
export const AUTH_PASSWORD_HINT = "8자 이상, 대문자/소문자/특수문자 포함";

/** 비밀번호 규칙 미충족 (배너·API). */
export const AUTH_PASSWORD_INVALID = `비밀번호: ${AUTH_PASSWORD_HINT}`;
