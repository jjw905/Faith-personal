export type OAuthProviderId = "google" | "naver" | "twitter";

/**
 * 서버 env에 ID·Secret이 모두 있을 때만 소셜 provider를 노출한다.
 * 네이버 스위치는 auth.ts의 NAVER_LOGIN_ENABLED와 동일하게 false로 둔다
 * (auth 모듈을 여기서 import하면 클라이언트 번들 경계가 꼬일 수 있음).
 */
const NAVER_LOGIN_ENABLED = false;

export function configuredOAuthProviders(): OAuthProviderId[] {
  const list: OAuthProviderId[] = [];
  if (
    process.env.AUTH_GOOGLE_ID?.trim() &&
    process.env.AUTH_GOOGLE_SECRET?.trim()
  ) {
    list.push("google");
  }
  if (
    NAVER_LOGIN_ENABLED &&
    process.env.AUTH_NAVER_ID?.trim() &&
    process.env.AUTH_NAVER_SECRET?.trim()
  ) {
    list.push("naver");
  }
  if (
    process.env.AUTH_TWITTER_ID?.trim() &&
    process.env.AUTH_TWITTER_SECRET?.trim()
  ) {
    list.push("twitter");
  }
  return list;
}
