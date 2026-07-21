export type ChangelogSection = {
  title: string;
  body?: string;
  items?: string[];
};

export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  summary: string;
  sections: ChangelogSection[];
};

/**
 * 개발전용 Changelog.
 * 날짜당 1개, 최신 날짜가 위.
 * 제품 변화는 이어서 적고, 디자인 근거·프로세스 언급은 쓰지 않음.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.6",
    date: "2026-07-20",
    title: "보관함 스토리지, 도움말, 워크스페이스",
    summary:
      "보관함을 계정별 500MB 클라우드 저장으로 연결했고, 회의 기록 업로드·첨부에서도 같은 공간을 씁니다. 도움말은 문서형으로 정리했고, 팀·개인 설정과 예정 회의 목록도 손봤습니다.",
    sections: [
      {
        title: "보관함",
        items: [
          "유저당 500MB, 파일 올리기·검색·삭제·전체 비우기",
          "회의 기록 업로드와 첨부에서 보관함 선택",
          "메뉴에 보관함 노출",
        ],
      },
      {
        title: "도움말, 설정",
        items: [
          "검색과 목차가 있는 문서형 도움말, 읽는 동안 메뉴 숨김",
          "워크스페이스별 설정, 예정 회의 목록과 생성 흐름",
        ],
      },
    ],
  },
  {
    version: "0.5",
    date: "2026-07-19",
    title: "회의 상세, 대화기록, 키워드",
    summary:
      "회의 상세를 요약·참석·타임라인·첨부 중심으로 모으고, 대화기록은 채팅형 다시보기로 분리했습니다. 처리 상태 대신 안건·결정·후속 같은 키워드로 목록을 읽게 바꿨습니다.",
    sections: [
      {
        title: "회의 상세",
        items: [
          "요약, 참석자, 타임라인, 첨부 구성",
          "대화기록으로 이동해 말풍선으로 다시보기",
          "타임라인 구간을 고르면 해당 대화로 이동",
        ],
      },
      {
        title: "키워드와 목록",
        items: [
          "완료·처리 중 배지 제거",
          "안건, 논의, 결정, 후속, 액션, 미결 키워드 표시",
        ],
      },
    ],
  },
  {
    version: "0.4",
    date: "2026-07-18",
    title: "워크스페이스, 대시보드, 타임라인",
    summary:
      "회의를 팀·개인 공간으로 나누고 홈을 회의 화면으로 옮겼습니다. 감사·사용자 메뉴와 목록·예정이 공간에 맞게 달라지고, 상세에는 구간별 타임라인 요약을 넣었습니다.",
    sections: [
      {
        title: "워크스페이스",
        items: [
          "사이드바에 팀·개인 워크스페이스, 기본은 팀",
          "감사 로그·팀 관리는 팀에서만",
          "목록, 예정, 설정을 워크스페이스별로 분리",
        ],
      },
      {
        title: "대시보드",
        items: [
          "홈에서 녹음·업로드·회의 목록",
          "분석을 감사 로그로 통합, 알림 패널과 도움말 메뉴",
        ],
      },
      {
        title: "타임라인",
        items: ["구간별 안건, 논의, 결정, 조치 요약"],
      },
    ],
  },
  {
    version: "0.2",
    date: "2026-07-17",
    title: "랜딩, 회원가입, 로그인",
    summary:
      "접속 시 메인과 마스킹 데모가 보이도록 맞추고, 회원가입·로그인·비밀번호 찾기 화면을 이어서 구성했습니다.",
    sections: [
      {
        title: "랜딩",
        items: [
          "실시간 마스킹 데모 채팅",
          "기능 소개, 개인정보 처리방침과 푸터",
        ],
      },
      {
        title: "계정",
        items: [
          "이메일 회원가입, 중복확인, 비밀번호 규칙",
          "로그인, 비밀번호 찾기, 소셜 가입 진입",
        ],
      },
    ],
  },
];

export type DevAgendaItem = {
  label: string;
  done?: boolean;
};

/** Changelog 페이지 상단, 오늘 개발 안건. */
export const DEV_AGENDA: {
  date: string;
  items: DevAgendaItem[];
} = {
  date: "2026-07-21",
  items: [
    { label: "로그인 / 회원가입 실제 서비스 연동 및 테스트", done: true },
    { label: "유저권한 설정 구현 및 테스트", done: true },
    { label: "보관함 기능 스토리지 연결", done: true },
    { label: "STT AI 연결 및 테스트" },
  ],
};

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
