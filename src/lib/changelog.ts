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
    version: "0.9.1",
    date: "2026-07-31",
    title: "사용량 안내, 개인 설정, 보존 기간",
    summary:
      "분석 시간을 다 쓰면 닫을 수 있는 안내가 뜹니다. 개인 설정이 서버에 저장되고, 회의 기록과 알림 보존 기간을 바꿀 수 있습니다. 감사 로그는 별도 보관입니다.",
    sections: [
      {
        title: "사용량",
        items: [
          "한도 도달 시 닫을 수 있는 안내 팝업",
          "설문으로 분석 시간 늘리기 안내",
        ],
      },
      {
        title: "설정",
        items: [
          "자동 마스킹, 화자 분리, 요약 언어 저장",
          "회의 기록과 알림 보존 기간 선택",
          "감사 로그는 법령상 최소 2년, 보존 설정과 무관",
        ],
      },
    ],
  },
  {
    version: "0.9",
    date: "2026-07-26",
    title: "회의 다시듣기, 말한 사람 구분",
    summary:
      "회의 대화를 실제 녹음과 함께 다시 들을 수 있습니다. 말풍선을 고르면 그 대목부터 재생되고, 누가 말했는지도 나눠서 보여 줍니다. 보관함은 휴대폰에서 쓰기 편하게 정리했습니다.",
    sections: [
      {
        title: "다시듣기",
        items: [
          "회의 원본 녹음으로 대화 다시 듣기",
          "대화와 소리의 시각을 맞춰 재생",
          "원하는 대목을 골라 그 지점부터 듣기",
        ],
      },
      {
        title: "회의 기록",
        items: [
          "말한 사람별로 대화 나눠 보기",
          "참석자를 고르면 해당 발언만 확인",
          "요약, 참석자, 타임라인 화면 정리",
        ],
      },
      {
        title: "보관함, 화면",
        items: [
          "휴대폰에서 올리기, 받기, 지우기 정리",
          "예정과 기록이 비었을 때 안내 표시",
          "요금제 화면을 현재 상태 중심으로 간단히",
        ],
      },
    ],
  },
  {
    version: "0.8",
    date: "2026-07-24",
    title: "팀 공간, 온라인 음성 회의",
    summary:
      "팀을 만들고 초대로 모을 수 있습니다. 온라인으로 모여 말하고 필요할 때 기록을 켤 수 있으며, 예정 회의 알림을 확인하면 일정에 반영됩니다. 시작 화면 데모도 더 자연스럽게 이어집니다.",
    sections: [
      {
        title: "팀",
        items: [
          "초대로 팀 합류, 수락과 거절",
          "팀원, 팀장, 팀 대표 역할과 권한",
          "공지, 예정 회의, 미확인 알림 확인",
          "팀이 없으면 팀 플랜 안내로 이동",
        ],
      },
      {
        title: "회의",
        items: [
          "팀 온라인 음성 회의",
          "주최자가 기록 시작과 중지",
          "개인 공간에서는 기록 시작으로 진행",
        ],
      },
      {
        title: "안내, 시작 화면",
        items: [
          "도움말, 개인정보 처리, 이용약관에 팀과 음성, 기록 안내 반영",
          "기능 소개와 대화 데모 전환이 더 매끄럽게",
        ],
      },
    ],
  },
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
    version: "0.9",
    date: "2026-07-26",
    title: "화자분리, 실측 타임스탬프, 재생 스트리밍",
    summary:
      "pyannote 화자분리를 업로드와 실시간 경로에 연결하고, 대화기록 시각을 whisper 실측 구간으로 정렬했다. 추정 시각 폴백은 기본 차단한다. 재생은 Range 스트리밍 API로 바꿔 seek을 지원한다.",
    sections: [
      {
        title: "받아쓰기 파이프라인",
        items: [
          "diarize-meeting, chunked-transcribe, process-upload 연결",
          "realtime process-realtime 화자 라벨 반영",
          "buildMeetingFromDiarize allowEstimateTimes 기본 off",
          "timed-segments 없으면 업로드, 실시간 모두 실패 처리",
        ],
      },
      {
        title: "재생, 스토리지",
        items: [
          "api/meetings/[id]/replay-audio Range 스트리밍",
          "vault content 라우트 스트리밍, Range 지원",
          "meeting.replayAudio 필드, 벤치 원본 경로 확정",
          "scripts/extract-timed-segments.py, seed:stt-bench",
        ],
      },
      {
        title: "접근, 보안",
        items: [
          "canReadMeeting 목, 카탈로그 회의 열람 복구",
          "user-meetings-store 회의 id 화이트리스트 검증",
          "replay-audio Content-Disposition 파일명 정규화",
          ".venv-stt gitignore 추가",
        ],
      },
      {
        title: "UI",
        items: [
          "워크스페이스 전환을 경로 기준 단일 동기화로 정리",
          "lib/workspace-route 경로 판정 공용화",
          "캔버스 대비를 위해 섹션 배경 panel-surface 정리",
          "사이드바 개인, 팀 라벨과 아이콘 단순화",
        ],
      },
    ],
  },
  {
    version: "0.8",
    date: "2026-07-24",
    title: "Team core, LiveKit, 정책 UI",
    summary:
      "팀 스키마와 초대, 권한, 일정, 공지, 미확인 알림을 붙이고 LiveKit 음성 방과 기록 토글을 연결했다. 오프라인 팀 회의는 제외했다. 마케팅 채팅 데모 흔들림도 정리했다.",
    sections: [
      {
        title: "팀 데이터, API",
        items: [
          "Prisma team_core, workspace_policy 마이그레이션",
          "teams, invites respond, members, people, audit, announcements",
          "team-meetings create/room/access, meeting-access bulk",
          "permission matrix, meeting-access, schedule conflict/lock",
          "notifications confirm, 예정 미확인 동기화",
        ],
      },
      {
        title: "음성, 기록",
        items: [
          "LiveKit token API, team-voice-room, 주최자 기록 on/off",
          "infra/livekit setup-on-droplet, env LiveKit 키",
          "주최자 부재, 기록 전/중 상태, 받아쓰기 할당 연계 훅",
        ],
      },
      {
        title: "UI, 문서",
        items: [
          "role별 team-workspace-panel, manage, composer, upcoming row",
          "개인 cta 기록 시작, 팀 회의 setup, 오프라인 제거",
          "help, legal, /terms 팀·음성·기록 반영",
          "Faith-office 팀 운영정책, 보안권한, LiveKit 인프라 docx",
          "marketing chat-mock 높이 예약, feature scale, 아바타 클리핑",
        ],
      },
    ],
  },
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
    title: "Vault API, Help chrome, 받아쓰기 백엔드",
    summary:
      "유저당 500MB vault를 Spaces/로컬 디스크로 붙이고 회의 업로드와 공유한다. Help는 /help에서 셸 숨김. FastAPI 받아쓰기/correct와 ffmpeg Whisper 전처리를 추가했다.",
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
        title: "받아쓰기",
        items: [
          "FastAPI 받아쓰기/correct, ffmpeg re-encode for Whisper",
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
  date: "2026-07-26",
  items: [
    { label: "화자분리 업로드, 실시간 경로 연결", done: true },
    { label: "실측 타임스탬프로 대화기록 정렬", done: true },
    { label: "재생 Range 스트리밍 API", done: true },
    { label: "워크스페이스 전환 경로 기준 정리", done: true },
    { label: "받아쓰기 모델 벤치 비교 정리" },
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
