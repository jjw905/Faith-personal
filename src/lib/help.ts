export type HelpNavGroup = {
  title: string;
  items: { id: string; title: string }[];
};

export type HelpArticle = {
  id: string;
  title: string;
  /** 한 줄 핵심 */
  summary: string;
  /** 핵심만 짧게 */
  bullets: string[];
};

export const HELP_NAV: HelpNavGroup[] = [
  {
    title: "시작하기",
    items: [
      { id: "welcome", title: "Faith 소개" },
      { id: "workspace", title: "워크스페이스" },
      { id: "first-meeting", title: "첫 회의 기록" },
    ],
  },
  {
    title: "회의",
    items: [
      { id: "record", title: "녹음과 업로드" },
      { id: "upcoming", title: "예정 회의" },
      { id: "records", title: "회의 기록과 검색" },
      { id: "timeline", title: "타임라인과 대화" },
    ],
  },
  {
    title: "보안",
    items: [{ id: "masking", title: "개인정보 마스킹" }],
  },
  {
    title: "계정",
    items: [
      { id: "settings", title: "시스템 설정" },
      { id: "notifications", title: "알림" },
      { id: "contact", title: "문의" },
    ],
  },
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "welcome",
    title: "Faith 소개",
    summary: "회의를 남기고, 가리고, 다시 봅니다.",
    bullets: [
      "녹음 또는 파일 업로드로 기록",
      "개인정보 자동 마스킹",
      "요약, 타임라인으로 정리",
    ],
  },
  {
    id: "workspace",
    title: "워크스페이스",
    summary: "왼쪽에서 팀 / 개인을 고릅니다.",
    bullets: [
      "팀: 공유 회의, 감사, 사용자 관리",
      "개인: 내 일정, 내 기록만",
      "선택은 다음에 열 때도 유지",
    ],
  },
  {
    id: "first-meeting",
    title: "첫 회의 기록",
    summary: "홈에서 바로 시작합니다.",
    bullets: [
      "녹음 시작 또는 파일 올리기",
      "끝나면 아래 회의 기록에서 열기",
      "요약, 참석자, 타임라인, 첨부 확인",
    ],
  },
  {
    id: "record",
    title: "녹음과 업로드",
    summary: "실시간 녹음, 파일 업로드 두 가지.",
    bullets: [
      "팀: 팀 회의 시작 / 개인: 기록 시작",
      "진행은 상단 최근 활동에서 확인",
    ],
  },
  {
    id: "upcoming",
    title: "예정 회의",
    summary: "다가올 일정을 미리 적습니다.",
    bullets: [
      "제목, 시간, 장소, 안건, 참석자 저장",
      "+ 또는 목록 아래에서 추가",
      "목록 / 격자 보기 전환 가능",
    ],
  },
  {
    id: "records",
    title: "회의 기록과 검색",
    summary: "지난 회의를 빠르게 찾습니다.",
    bullets: [
      "상단 검색: 제목, 참석자",
      "기간: 주 / 월 / 년, 정렬 변경",
      "항목 탭 → 상세로 이동",
    ],
  },
  {
    id: "timeline",
    title: "타임라인과 대화",
    summary: "구간 요약과 채팅형 다시보기.",
    bullets: [
      "타임라인: 안건, 논의, 결정, 후속",
      "구간 선택 → 대화기록으로 이동",
      "말풍선으로 다시 보기",
    ],
  },
  {
    id: "masking",
    title: "개인정보 마스킹",
    summary: "기록 후 자동으로 가립니다.",
    bullets: [
      "진행은 최근 활동에서 확인",
      "대화에서 가림값 탭 → 원문 확인",
      "기본 방식은 시스템 설정에서 변경",
    ],
  },
  {
    id: "settings",
    title: "시스템 설정",
    summary: "마스킹, 보존 등 동작 설정.",
    bullets: [
      "시스템 설정: 마스킹, 보존",
      "계정 설정: 프로필, 언어, 알림 수신",
    ],
  },
  {
    id: "notifications",
    title: "알림",
    summary: "헤더 벨에서 모아서 봅니다.",
    bullets: [
      "처리 결과, 활동 알림",
      "수신 여부는 계정 설정에서 조정",
    ],
  },
  {
    id: "contact",
    title: "문의",
    summary: "메일 보내기 → 기본 메일 앱 열림.",
    bullets: [
      "수신: support@faith.app",
      "안 열리면 아래 Mac / Windows 설정 확인",
    ],
  },
];

const CONTACT_SEARCH_EXTRA = [
  "support@faith.app",
  "메일 보내기",
  "mailto",
  "Mac",
  "Windows",
  "기본 이메일",
  "기본 앱",
].join(" ");

export function searchHelpArticles(query: string): HelpArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return HELP_ARTICLES;
  return HELP_ARTICLES.filter((article) => {
    const hay = [
      article.title,
      article.summary,
      ...article.bullets,
      article.id === "contact" ? CONTACT_SEARCH_EXTRA : "",
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}
