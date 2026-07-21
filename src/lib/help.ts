import { docsTextMatches } from "@/lib/docs-search";

export type HelpNavGroup = {
  title: string;
  items: { id: string; title: string }[];
};

export type HelpArticle = {
  id: string;
  title: string;
  /** 한 줄 핵심 */
  summary: string;
  /** 짧은 설명 (1~2문장) */
  body: string[];
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
    body: [
      "팀과 개인 워크스페이스에서 회의를 기록하고 정리하는 앱입니다.",
      "홈에서 녹음하거나 파일을 올리면 마스킹과 요약을 거친 뒤 회의 기록에 쌓입니다.",
    ],
  },
  {
    id: "workspace",
    title: "워크스페이스",
    summary: "왼쪽 메뉴에서 팀 / 개인을 고릅니다.",
    body: [
      "팀은 공유 회의와 권한 공간입니다. 감사 로그와 팀 관리는 팀에서만 보입니다.",
      "개인은 내 회의만 보는 공간입니다. 예정은 내 일정, 기록은 내 기록으로 표시됩니다.",
    ],
  },
  {
    id: "first-meeting",
    title: "첫 회의 기록",
    summary: "홈에서 바로 시작합니다.",
    body: [
      "홈 상단에서 녹음을 시작하거나 파일을 올립니다.",
      "처리가 끝나면 아래 회의 기록에서 열어 요약, 참석자, 타임라인, 첨부를 확인합니다.",
    ],
  },
  {
    id: "record",
    title: "녹음과 업로드",
    summary: "실시간 녹음과 파일 업로드 두 가지.",
    body: [
      "팀에서는 팀 회의 시작, 개인에서는 기록 시작으로 표시됩니다.",
      "업로드 후 처리 진행은 상단 최근 활동에서 볼 수 있습니다.",
    ],
  },
  {
    id: "upcoming",
    title: "예정 회의",
    summary: "다가올 일정을 미리 적습니다.",
    body: [
      "예정 회의(개인은 내 일정)에서 제목, 시간, 장소, 안건, 참석자를 저장합니다.",
      "헤더의 + 또는 목록 아래 추가로 만들고, 목록과 격자 보기를 바꿀 수 있습니다.",
    ],
  },
  {
    id: "records",
    title: "회의 기록과 검색",
    summary: "지난 회의를 기간과 키워드로 찾습니다.",
    body: [
      "홈 상단 검색에서 제목, 참석자로 찾을 수 있습니다.",
      "회의 기록에서는 주, 월, 년 기간과 정렬을 바꾼 뒤 항목을 눌러 상세로 이동합니다.",
    ],
  },
  {
    id: "timeline",
    title: "타임라인과 대화",
    summary: "구간 요약과 채팅형 다시보기.",
    body: [
      "회의 상세 타임라인에서 안건, 논의, 결정, 후속 조치를 시간순으로 봅니다.",
      "구간을 누르면 대화기록으로 이동하고, 실시간 회의와 같은 말풍선으로 다시 봅니다.",
    ],
  },
  {
    id: "masking",
    title: "개인정보 마스킹",
    summary: "기록 후 자동으로 감지해 가립니다.",
    body: [
      "처리 중 진행은 상단 최근 활동에서 확인할 수 있습니다.",
      "대화기록에서 가려진 값을 누르면 원문을 볼 수 있고, 기본 방식은 시스템 설정에서 바꿉니다.",
    ],
  },
  {
    id: "settings",
    title: "시스템 설정",
    summary: "마스킹, 보존 등 앱 동작을 관리합니다.",
    body: [
      "왼쪽 메뉴의 시스템 설정에서 마스킹과 보존 옵션을 봅니다.",
      "프로필, 언어, 알림 수신은 계정 설정에서 변경합니다.",
    ],
  },
  {
    id: "notifications",
    title: "알림",
    summary: "헤더 오른쪽 벨에서 모아서 봅니다.",
    body: [
      "새 처리 결과와 활동 알림을 한곳에서 확인합니다.",
      "어떤 알림을 받을지는 계정 설정에서 조정합니다.",
    ],
  },
  {
    id: "contact",
    title: "문의",
    summary: "메일 보내기를 누르면 기본 메일 앱이 열립니다.",
    body: [],
  },
];

export function searchHelpArticles(query: string): HelpArticle[] {
  const q = query.trim();
  if (!q) return HELP_ARTICLES;
  return HELP_ARTICLES.filter((article) =>
    docsTextMatches(
      [article.title, article.summary, ...article.body].join(" "),
      q,
    ),
  );
}
