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
 * 사용자용 Changelog (/changelog).
 * 쓸 수 있게 된 변화만, 일상 언어로. 내부 용어·관리 기능은 넣지 않음.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.7",
    date: "2026-07-21",
    title: "간편 로그인, 보관함, 회의 시작",
    summary:
      "Google, 네이버, X로도 바로 들어올 수 있고, 계정에서 로그인 수단을 연결하거나 끊을 수 있습니다. 보관함에 미리 올려 둔 파일을 회의 때 바로 쓰고, 새 회의도 누구나 시작할 수 있습니다.",
    sections: [
      {
        title: "로그인",
        items: [
          "이메일로 가입하거나 Google, 네이버, X로 로그인",
          "계정 설정에서 소셜 로그인 연결, 해제",
          "이미 쓰는 로그인 수단은 실수로 끊기지 않도록 유지",
        ],
      },
      {
        title: "보관함, 회의",
        items: [
          "보관함에 파일을 미리 올려 두고 회의 때 골라 쓰기",
          "홈과 상단에서 새 회의를 바로 시작",
        ],
      },
    ],
  },
  {
    version: "0.6",
    date: "2026-07-20",
    title: "보관함, 도움말, 내 공간 설정",
    summary:
      "계정마다 500MB 보관함이 생겼습니다. 자료를 미리 모아 두고 회의 첨부나 업로드에서 골라 쓰면 됩니다. 도움말도 목차와 검색으로 찾기 쉽게 정리했습니다.",
    sections: [
      {
        title: "보관함",
        items: [
          "파일 올리기, 찾기, 지우기, 한 번에 비우기",
          "회의 올릴 때 보관함에서 고르기",
          "메뉴에서 보관함으로 바로 이동",
        ],
      },
      {
        title: "도움말, 설정",
        items: [
          "궁금한 내용을 검색하고 목차로 이동",
          "팀과 개인 공간에 맞춰 설정과 예정 회의 보기",
        ],
      },
    ],
  },
  {
    version: "0.5",
    date: "2026-07-19",
    title: "회의 다시보기, 핵심만 훑기",
    summary:
      "회의 한곳을 열면 요약, 참석자, 흐름, 첨부를 한눈에 볼 수 있습니다. 대화는 채팅처럼 다시 보고, 목록에서는 안건과 결정 같은 말로 빠르게 구분합니다.",
    sections: [
      {
        title: "회의 상세",
        items: [
          "요약, 참석자, 흐름, 첨부를 한 화면에서 확인",
          "대화기록을 말풍선으로 다시보기",
          "흐름에서 구간을 고르면 그 대화로 이동",
        ],
      },
      {
        title: "목록",
        items: [
          "안건, 논의, 결정, 후속처럼 회의 내용으로 구분",
        ],
      },
    ],
  },
  {
    version: "0.4",
    date: "2026-07-18",
    title: "팀과 개인 공간, 홈에서 바로 회의",
    summary:
      "팀 회의와 나만의 회의를 나눠 볼 수 있습니다. 홈에서 녹음하고 올리고 목록을 보고, 회의 안에서는 구간별로 무엇이 오갔는지 흐름을 따라갑니다.",
    sections: [
      {
        title: "공간",
        items: [
          "팀 공간과 개인 공간을 바꿔 가며 사용",
          "목록, 예정, 설정도 공간에 맞게 표시",
        ],
      },
      {
        title: "홈, 회의 흐름",
        items: [
          "홈에서 녹음, 업로드, 최근 회의 확인",
          "알림과 도움말로 필요한 안내 받기",
          "구간별 안건, 논의, 결정, 조치 요약",
        ],
      },
    ],
  },
  {
    version: "0.2",
    date: "2026-07-17",
    title: "시작 화면, 가입과 로그인",
    summary:
      "접속하면 Faith가 무엇을 하는지 바로 볼 수 있고, 가입부터 로그인, 비밀번호 찾기까지 이어서 진행할 수 있습니다.",
    sections: [
      {
        title: "첫인상",
        items: [
          "실시간으로 가려지는 대화 데모",
          "기능 소개와 개인정보 안내",
        ],
      },
      {
        title: "계정",
        items: [
          "이메일로 가입하고 로그인",
          "비밀번호를 잊었을 때 다시 설정",
        ],
      },
    ],
  },
];

/**
 * 개발전용 Changelog (/changelog/dev).
 * 구현, 스키마, 운영, 보안 관점. 날짜당 1개, 최신 위.
 */
export const DEV_CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.7",
    date: "2026-07-21",
    title: "Auth.js 프로덕션, Plan, Spaces vault",
    summary:
      "Credentials와 Google, 네이버, X OAuth를 DO에 올렸고, Account는 providerAccountId 기준 링크만 허용한다. Plan(FREE/PRO)과 Role(ADMIN)을 세션에 실었고, vault는 Spaces presign 실패 시 서버 업로드로 폴백한다.",
    sections: [
      {
        title: "Auth, 세션",
        items: [
          "설정된 OAuth provider만 등록, 클라이언트 signIn으로 소셜 로그인",
          "이메일 기준 자동 병합 금지, 로그인 후 Account 링크/unlink",
          "소셜 가입 시 기존 이메일 충돌 차단, 최초 provider 잠금",
          "OAuth verified email 자동 통과, Resend 미설정 시 가입 자동 verify",
          "JWT DB 동기화 쓰로틀, login rate limit, Server Action stale 대응",
        ],
      },
      {
        title: "권한, 어드민",
        items: [
          "Plan FREE/PRO, Role ADMIN, 세션/JWT 반영",
          "ADMIN_EMAILS 로그인 승격, 소셜 경로 오승격 차단",
          "사용자 관리 등급/역할 UI, /api/setup/admin, 어드민 복구 도구",
          "인증 DB 초기화 엔드포인트, /api/health/auth 스키마·시크릿 점검",
        ],
      },
      {
        title: "Vault, 보안",
        items: [
          "Spaces presign, Load failed 시 서버 경유 업로드, 업로드 rate limit",
          "start 시 prisma migrate deploy, security headers, bcrypt 길이 제한",
          "health 응답 민감정보 축소, 마스킹 한도, 디자인 랩(/design)",
        ],
      },
    ],
  },
  {
    version: "0.6",
    date: "2026-07-20",
    title: "Vault API, Help chrome, STT 백엔드",
    summary:
      "유저당 500MB vault를 Spaces/로컬 디스크로 붙이고 회의 업로드와 공유한다. Help는 /help에서 셸 숨김. FastAPI STT/correct와 ffmpeg Whisper 전처리를 추가했다.",
    sections: [
      {
        title: "Vault",
        items: [
          "quota, prepare/complete/local 업로드 API, 회의 첨부 선택",
          "DEV_NAV 보관함, Changelog 0.6, 개발안건 섹션",
        ],
      },
      {
        title: "Help, 워크스페이스",
        items: [
          "문서형 help 데이터, 검색, 목차, hideChrome on /help",
          "워크스페이스별 settings, upcoming 생성 흐름",
        ],
      },
      {
        title: "STT",
        items: [
          "FastAPI STT/correct, ffmpeg re-encode for Whisper",
          "Auth.js Google, 네이버, X provider 초안",
        ],
      },
    ],
  },
  {
    version: "0.5",
    date: "2026-07-19",
    title: "회의 상세 라우트, 키워드 모델",
    summary:
      "회의 상세/대화기록 뷰를 분리하고 query(line, segment)로 포커스한다. 상태 배지 대신 topic keyword로 목록을 렌더한다.",
    sections: [
      {
        title: "UI, 데이터",
        items: [
          "meeting detail, chat replay, timeline deep-link",
          "status chip 제거, 안건/논의/결정/후속 키워드",
          "meeting-records 반응형 헤더, period filter 레이아웃",
        ],
      },
    ],
  },
  {
    version: "0.4",
    date: "2026-07-18",
    title: "워크스페이스 컨텍스트, 라우팅",
    summary:
      "team/personal workspace를 컨텍스트와 로컬 스토리지로 분리한다. 마케팅 / 와 대시보드 /dashboard를 나누고 감사 로그 메뉴를 팀 스코프로 제한한다.",
    sections: [
      {
        title: "앱 셸",
        items: [
          "WorkspaceId context, NAV 조건부 렌더",
          "감사 로그 통합, 알림 패널, 도움말 메뉴",
          "timeline segment 요약 데이터 구조",
        ],
      },
      {
        title: "마케팅, 인증 UI",
        items: [
          "랜딩 라이브 마스킹 데모, signup/login 페이지",
          "bank alias 타입 수정, nav CTA",
        ],
      },
    ],
  },
  {
    version: "0.2",
    date: "2026-07-17",
    title: "마스킹 파이프라인, 랜딩 실험",
    summary:
      "PII 마스킹 파이프라인과 라이브 실험 UI를 넣었다. 이후 인증·스토리지 프로덕션화의 기반이 된다.",
    sections: [
      {
        title: "마스킹",
        items: [
          "패턴/하이브리드 마스킹, 라이브 데모 채팅",
          "기능 소개, privacy 페이지, 푸터",
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
  date: "2026-07-22",
  items: [
    { label: "STT 모델 선정" },
    { label: "기능에 따른 비용 타산추정" },
    { label: "모델 도입에 따른 UI/UX 수정" },
    { label: "요금제 도입" },
    { label: "테스트 및 보완" },
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
