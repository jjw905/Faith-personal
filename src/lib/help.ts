import { docsTextMatches } from "@/lib/docs-search";

export type HelpNavGroup = {
  title: string;
  items: { id: string; title: string }[];
};

export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

export type HelpArticle = {
  id: string;
  title: string;
  /** 한 줄 핵심 */
  summary: string;
  blocks: HelpBlock[];
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
    title: "팀",
    items: [
      { id: "team-roles", title: "팀과 역할" },
      { id: "team-schedule", title: "팀 일정과 알림" },
      { id: "team-voice", title: "온라인 음성과 기록" },
      { id: "team-announce", title: "팀 공지" },
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

function articlePlainText(article: HelpArticle): string {
  const parts: string[] = [article.title, article.summary];
  for (const block of article.blocks) {
    if (block.type === "p") parts.push(block.text);
    else if (block.type === "ul" || block.type === "ol") {
      parts.push(...block.items);
    }
  }
  return parts.join(" ");
}

/**
 * 도움말 톤: Cursor 통신 규칙과 동일.
 * 핵심만, 직접, 짧게. 마케팅/애교 문구 없음.
 */
export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "welcome",
    title: "Faith 소개",
    summary: "회의 음성을 받아쓰고 요약, 타임라인으로 정리합니다.",
    blocks: [
      {
        type: "p",
        text: "Faith는 음성을 구조화된 회의록으로 바꾸는 AI 워크스페이스입니다. 음성을 올리면 화자를 구분해 받아쓰고, 요약과 타임라인, 대화기록을 생성합니다. 개인정보는 자동으로 가립니다.",
      },
      {
        type: "p",
        text: "현재는 개인 공간에서 파일 업로드, 보관함, 기록 접근을 사용할 수 있습니다. 팀과 실시간 회의 기능은 준비 중입니다.",
      },
    ],
  },
  {
    id: "workspace",
    title: "워크스페이스",
    summary: "왼쪽 메뉴에서 개인과 팀을 고릅니다.",
    blocks: [
      {
        type: "ul",
        items: [
          "개인: 개인 회의 기록을 모읍니다. 현재 기본 작업 공간입니다",
          "팀: 일정, 온라인 음성, 공지용입니다. 현재는 준비 중이며 미리보기만 제공합니다",
        ],
      },
      {
        type: "p",
        text: "개인 설정과 팀 설정은 서로 영향을 주지 않습니다.",
      },
    ],
  },
  {
    id: "first-meeting",
    title: "첫 회의 기록",
    summary: "홈에서 파일을 올리면 정리가 시작됩니다.",
    blocks: [
      {
        type: "ol",
        items: [
          "개인 홈으로 이동합니다",
          "업로드 영역에 음성 또는 영상 파일을 놓거나 선택합니다",
          "빠른 정리 또는 화자 구분을 고른 뒤 시작합니다",
          "같은 화면에서 진행률을 확인합니다",
        ],
      },
      {
        type: "p",
        text: "완료되면 회의 기록에 항목이 생깁니다. 요약, 참석자, 타임라인, 대화기록을 한 화면에서 볼 수 있습니다. 창을 닫아도 처리는 계속됩니다.",
      },
      {
        type: "p",
        text: "먼저 2~3명의 짧은 회의로 시작하면 좋습니다. 화자 구분을 선택하면 대화가 사람별로 나뉩니다.",
      },
    ],
  },
  {
    id: "team-roles",
    title: "팀과 역할",
    summary: "현재 준비 중입니다.",
    blocks: [
      {
        type: "p",
        text: "팀 기능은 현재 준비 중입니다. 제공 시 팀원, 팀장, 팀 대표 역할과 초대, 열람 권한을 사용할 수 있습니다.",
      },
    ],
  },
  {
    id: "team-schedule",
    title: "팀 일정과 알림",
    summary: "현재 준비 중입니다.",
    blocks: [
      {
        type: "p",
        text: "팀 일정과 초대 알림은 현재 준비 중입니다. 제공 시 온라인 음성 일정을 만들고, 초대받은 사람만 참가할 수 있습니다.",
      },
    ],
  },
  {
    id: "team-voice",
    title: "온라인 음성과 기록",
    summary: "현재 준비 중입니다.",
    blocks: [
      {
        type: "p",
        text: "팀 온라인 음성과 실시간 기록은 현재 준비 중입니다. 지금은 파일 업로드로 회의록을 생성합니다.",
      },
    ],
  },
  {
    id: "team-announce",
    title: "팀 공지",
    summary: "현재 준비 중입니다.",
    blocks: [
      {
        type: "p",
        text: "팀 공지는 현재 준비 중입니다. 제공 시 팀 대표와 팀장이 공지를 작성하고 고정할 수 있습니다.",
      },
    ],
  },
  {
    id: "record",
    title: "녹음과 업로드",
    summary: "지금은 파일 업로드만 지원합니다.",
    blocks: [
      {
        type: "p",
        text: "실시간 녹음은 현재 준비 중입니다. 홈에서 음성, 영상 파일을 올려 회의록을 생성합니다.",
      },
      {
        type: "ul",
        items: [
          "업로드 길이 한도: 최대 60분",
          "이번 주기 잔여 시간 제한이 있습니다. 잔여 시간은 홈에서 확인할 수 있습니다.",
          "잔여 시간이 모두 소진되면 짧은 설문에 참여해 이번 주기 이용 시간을 늘릴 수 있습니다.",
          "진행 상태는 회의 상세에서 확인합니다",
        ],
      },
    ],
  },
  {
    id: "upcoming",
    title: "예정 회의",
    summary: "다가올 일정을 미리 적습니다.",
    blocks: [
      {
        type: "p",
        text: "개인 홈의 예정 회의에서 제목, 시간, 장소, 안건, 참석자를 적어 둡니다. 회의록은 업로드로 따로 만듭니다.",
      },
      {
        type: "ul",
        items: [
          "+ 버튼으로 일정을 추가합니다",
          "목록과 달력 보기를 전환할 수 있습니다",
          "지난 일정은 자동으로 정리됩니다",
        ],
      },
    ],
  },
  {
    id: "records",
    title: "회의 기록과 검색",
    summary: "지난 회의를 검색하고 엽니다.",
    blocks: [
      {
        type: "ul",
        items: [
          "홈 검색창에 제목 또는 참석자를 입력합니다",
          "기간을 주, 월, 년으로 바꾸고 정렬할 수 있습니다",
          "항목을 누르면 요약, 타임라인, 대화기록을 엽니다",
          "모바일에서는 하단 액션 바로 여러 건을 다운로드하거나 삭제할 수 있습니다",
        ],
      },
    ],
  },
  {
    id: "timeline",
    title: "타임라인과 대화",
    summary: "구간 요약과 대화 다시보기.",
    blocks: [
      {
        type: "p",
        text: "타임라인에 안건, 논의, 결정, 후속이 시간 순으로 정리됩니다. 전체를 다시 듣지 않아도 흐름을 확인할 수 있습니다.",
      },
      {
        type: "ul",
        items: [
          "구간을 누르면 대화기록으로 이동합니다",
          "재생하면 현재 단어가 강조됩니다",
          "말풍선 메모는 바로 저장됩니다",
        ],
      },
    ],
  },
  {
    id: "masking",
    title: "개인정보 마스킹",
    summary: "민감 정보는 자동으로 가립니다.",
    blocks: [
      {
        type: "p",
        text: "전화번호, 계좌, 카드, 주민등록번호 등은 받아쓰기 중 자동으로 가립니다.",
      },
      {
        type: "ul",
        items: [
          "가려진 값을 누르면 원문을 잠깐 볼 수 있습니다",
          "계정 설정에서 자동 마스킹을 켜거나 끌 수 있습니다",
          "자동 감지는 완벽하지 않을 수 있습니다. 공유 전에 확인하세요",
        ],
      },
    ],
  },
  {
    id: "settings",
    title: "시스템 설정",
    summary: "지금은 개인 설정만 변경할 수 있습니다.",
    blocks: [
      {
        type: "ul",
        items: [
          "자동 마스킹",
          "화자 구분",
          "요약 언어",
          "회의 기록과 알림 보존 기간",
        ],
      },
      {
        type: "ul",
        items: [
          "보존 기간을 줄이면 이미 지난 기록이 바로 삭제될 수 있습니다",
          "감사 로그는 법령상 최소 2년 보관되며 이 설정과 무관합니다",
          "팀 설정은 현재 준비 중입니다",
          "변경은 즉시 저장됩니다",
        ],
      },
    ],
  },
  {
    id: "notifications",
    title: "알림",
    summary: "헤더 벨에서 확인합니다.",
    blocks: [
      {
        type: "p",
        text: "왼쪽 메뉴 알림에서 실패·초대·보안 안내를 모아서 봅니다.",
      },
      {
        type: "ul",
        items: [
          "알림을 누르면 관련 화면으로 이동합니다",
          "확인한 알림은 보존 기간이 지나면 정리됩니다",
          "팀 일정, 공지 알림은 팀 기능 오픈 후 제공됩니다",
        ],
      },
    ],
  },
  {
    id: "contact",
    title: "문의",
    summary: "이메일로 보냅니다.",
    blocks: [
      {
        type: "p",
        text: "화면에서 해결되지 않으면 아래 이메일로 문의하세요. 접수 순으로 확인합니다.",
      },
      {
        type: "ul",
        items: [
          "처리 오류는 회의 제목과 대략 시간을 함께 적어 주세요",
        ],
      },
    ],
  },
];

export function searchHelpArticles(query: string): HelpArticle[] {
  const q = query.trim();
  if (!q) return HELP_ARTICLES;
  return HELP_ARTICLES.filter((article) =>
    docsTextMatches(articlePlainText(article), q),
  );
}
