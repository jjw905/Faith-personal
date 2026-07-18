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

/** 개발전용 Changelog. Cursor changelog 형식에 맞춰 최신순. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.4",
    date: "2026-07-18",
    title: "팀,개인 워크스페이스와 회의 타임라인",
    summary:
      "회의를 팀/개인 공간으로 나누고, 감사,사용자 메뉴와 목록,예정,처리 상태가 워크스페이스에 맞게 달라집니다. 회의 상세에는 녹음 구간별 타임라인 요약을 추가했습니다.",
    sections: [
      {
        title: "워크스페이스",
        body: "사이드바 회의 아래에 팀,개인 워크스페이스를 들여쓰기로 두었습니다. 기본 진입은 팀입니다.",
        items: [
          "감사 로그, 사용자 관리는 팀 선택 시에만 팀 하위에 노출",
          "개인 워크스페이스에서는 팀 전용 URL을 회의로 리다이렉트",
          "회의 목록, 예정 회의, 처리 상태를 워크스페이스별로 분리",
          "시스템 설정: 개인은 기본값만, 팀은 보존,마스킹 정책 강제 포함",
        ],
      },
      {
        title: "타임라인 요약",
        body: "회의 상세에서 녹음 구간을 분석한 안건, 논의, 결정, 리스크, 조치를 시간순으로 확인합니다.",
        items: [
          "전체 한 줄 요약",
          "구간별 카드, 발화자, 태그",
          "예시가 풍부한 회의: mtg-001 (Q3 보안 정책 검토)",
        ],
      },
    ],
  },
  {
    version: "0.3",
    date: "2026-07-18",
    title: "대시보드 IA 개편, 회의가 홈",
    summary:
      "빈 대시보드 대신 회의 기록,목록을 홈으로 두고, 분석은 감사 로그에 합쳤습니다. 알림은 오른쪽 패널, 시스템 설정은 헤더 톱니로 분리했습니다.",
    sections: [
      {
        title: "내비게이션",
        items: [
          "홈 = 회의 (실시간 녹음, 파일 업로드, 목록)",
          "분석 → 감사 로그로 통합",
          "보안 메뉴 정리, 계정 알림,설정으로 연결",
          "도움말 메뉴 추가",
          "헤더: 알림 드로어, 시스템 설정 아이콘",
        ],
      },
      {
        title: "회의 화면",
        items: [
          "기록하기와 목록을 한 흐름으로 합침",
          "목록 접기, 첫 화면에서 목록이 절반 이상 차지하지 않도록 조정",
          "예정 회의 패널, 처리 상태는 팝업으로 분리",
          "노이즈 샘플 오디오, 업로드는 클릭 시에만 드롭존 표시",
        ],
      },
    ],
  },
  {
    version: "0.2",
    date: "2026-07-17",
    title: "회원가입, 로그인, 비밀번호 찾기",
    summary:
      "이메일,비밀번호,이름 기반 회원가입과 소셜 간편 가입 진입, 로그인,비밀번호 찾기 화면을 맞췄습니다.",
    sections: [
      {
        title: "회원가입",
        items: [
          "이메일 중복확인, 비밀번호 규칙(대,소문자, 특수문자)",
          "비밀번호 보기/가리기, 입력 자리수 표시",
          "간편 소셜(네이버, Google, X)과 일반 회원가입 분리",
        ],
      },
      {
        title: "로그인,복구",
        items: [
          "로그인 패널 간격,소셜 정렬 정리",
          "비밀번호 찾기 화면 (회원가입,로그인과 동일 비율)",
        ],
      },
    ],
  },
  {
    version: "0.1",
    date: "2026-07-17",
    title: "랜딩과 마케팅 히어로",
    summary:
      "접속 시 메인이 보이도록 정리하고, 라이브 마스킹 데모 채팅,기능 타임라인,푸터 법적 고지를 구성했습니다.",
    sections: [
      {
        title: "히어로",
        items: [
          "실시간 마스킹 데모 채팅 (정상 대화 혼합, 스크롤 방해 최소화)",
          "날짜 구분선, 채팅 창 그림자",
          "데모 보기 부드러운 스크롤, 무료로 시작 → 대시보드 진입",
        ],
      },
      {
        title: "사이트",
        items: [
          "기능 소개 타임라인 (센터 스파인)",
          "개인정보 처리방침, 푸터 링크 구성",
          "반응형: 중간 애매한 브레이크포인트 축소",
        ],
      },
    ],
  },
];

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
