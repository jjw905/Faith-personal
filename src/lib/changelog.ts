export type ChangelogSection = {
  title: string;
  items?: string[];
};

export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  /** 한 줄만. 사연·배경 설명은 쓰지 않음. */
  summary?: string;
  sections: ChangelogSection[];
};

/**
 * 개발전용 Changelog.
 * 날짜당 1개, 최신 날짜가 위. 요청·변경 항목만 적음 (사연 설명 생략).
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.6",
    date: "2026-07-20",
    title: "보관함, 도움말, 워크스페이스",
    sections: [
      {
        title: "보관함",
        items: [
          "개발 메뉴 보관함 (올리기, 검색, 삭제)",
          "첨부·업로드에서 보관함 선택",
        ],
      },
      {
        title: "도움말, 설정",
        items: [
          "문서형 도움말",
          "워크스페이스 설정, 예정 회의 목록",
        ],
      },
      {
        title: "문구",
        items: ["사이트·문서·changelog는 요청 내용만 기록"],
      },
    ],
  },
  {
    version: "0.5",
    date: "2026-07-19",
    title: "회의 상세, 대화기록, 키워드",
    sections: [
      {
        title: "회의 상세",
        items: [
          "요약, 참석자, 타임라인, 첨부",
          "대화기록 다시보기",
          "타임라인 구간 → 대화 점프",
        ],
      },
      {
        title: "키워드",
        items: [
          "상태 배지 제거",
          "안건, 논의, 결정, 후속 등 키워드",
        ],
      },
    ],
  },
  {
    version: "0.4",
    date: "2026-07-18",
    title: "워크스페이스, 대시보드, 타임라인",
    sections: [
      {
        title: "워크스페이스",
        items: [
          "팀, 개인 워크스페이스",
          "감사·사용자는 팀만",
          "목록·예정·설정을 워크스페이스별 분리",
        ],
      },
      {
        title: "대시보드",
        items: [
          "홈 = 회의",
          "분석 → 감사 로그",
          "알림 패널, 도움말 메뉴",
        ],
      },
      {
        title: "타임라인",
        items: ["구간별 요약 (안건, 논의, 결정, 조치)"],
      },
    ],
  },
  {
    version: "0.2",
    date: "2026-07-17",
    title: "랜딩, 회원가입, 로그인",
    sections: [
      {
        title: "랜딩",
        items: [
          "마스킹 데모 채팅",
          "기능 소개, 개인정보 처리방침",
        ],
      },
      {
        title: "계정",
        items: [
          "회원가입, 로그인, 비밀번호 찾기",
          "이메일 중복확인, 소셜 가입 진입",
        ],
      },
    ],
  },
];

/** Changelog 페이지 상단, 오늘 개발 안건. */
export const DEV_AGENDA = {
  date: "2026-07-20",
  items: [
    "로그인 / 회원가입 실제 서비스 연동 및 테스트",
    "유저권한 설정 구현 및 테스트",
    "보관함 기능 스토리지 연결",
    "STT AI 연결 및 테스트",
  ],
} as const;

function formatChangelogDate(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

export function getChangelogDateLabel(iso: string) {
  return formatChangelogDate(iso);
}
