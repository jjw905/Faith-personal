/** Faith 문의 수신 주소. 기본 메일 앱(mailto)으로 엽니다. */
export const SUPPORT_EMAIL = "support@faith.app";

export type ClientOs = "mac" | "windows" | "other";

export function detectClientOs(): ClientOs {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const platform = navigator.platform ?? "";
  if (/Mac|iPhone|iPad|iPod/i.test(platform) || /Mac OS X|Macintosh/i.test(ua)) {
    return "mac";
  }
  if (/Win/i.test(platform) || /Windows/i.test(ua)) {
    return "windows";
  }
  return "other";
}

export function clientOsLabel(os: ClientOs = detectClientOs()): string {
  if (os === "mac") return "macOS";
  if (os === "windows") return "Windows";
  return "기타";
}

/** Outlook(Windows) 한도를 고려해 본문을 짧게 유지합니다. */
export function buildSupportMailto(options?: {
  subject?: string;
  body?: string;
  os?: ClientOs;
}): string {
  const os = options?.os ?? detectClientOs();
  const subject = options?.subject ?? "Faith 문의";
  const body =
    options?.body ??
    [
      "안녕하세요,",
      "",
      "문의 내용:",
      "",
      "",
      "---",
      `환경: ${clientOsLabel(os)}`,
    ].join("\n");

  const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  // Outlook 데스크톱 인자 길이 한도 대비
  if (href.length > 1500) {
    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  }
  return href;
}

export const MAIL_SETUP = {
  mac: {
    title: "Mac",
    steps: [
      "Mail > 설정 > 일반",
      "기본 이메일 읽기 프로그램 선택",
      "메일 보내기 다시 실행",
    ],
  },
  windows: {
    title: "Windows",
    steps: [
      "설정 > 앱 > 기본 앱",
      "이메일 또는 mailto 기본값 지정",
      "메일 보내기 다시 실행",
    ],
  },
} as const;
