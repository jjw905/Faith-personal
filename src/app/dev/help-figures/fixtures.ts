/** 도움말 figure 전용 가데이터. 실명·시드 회의·학습 원문 금지. */

export const HELP_FIG_SPEAKERS = {
  a: { name: "김서연", initial: "김", color: "bg-[#3d6a8a]" },
  b: { name: "박준호", initial: "박", color: "bg-[#5b4a8a]" },
  me: { name: "나", initial: "나", color: "bg-[#2f6b45]" },
} as const;

export const HELP_FIG_HOME = {
  dateLabel: "2026년 3월 12일 목요일",
  title: "내 회의",
  schedules: [
    {
      when: "오늘 14:00, 30분",
      title: "주간 마케팅 싱크",
      place: "Meet",
    },
    {
      when: "내일 10:00, 45분",
      title: "스프린트 계획",
      place: "모바일 녹음",
    },
  ],
  records: [
    {
      when: "3. 11. (수) 오후 3:00",
      ago: "1일전",
      capture: "업로드",
      title: "3분기 마케팅 캠페인 킥오프",
      tags: ["채널", "예산", "일정"],
      duration: "42분",
    },
    {
      when: "3. 10. (화) 오전 11:00",
      ago: "2일전",
      capture: "실시간",
      title: "온보딩 점검",
      tags: ["온보딩", "체크리스트"],
      duration: "28분",
    },
  ],
} as const;

export const HELP_FIG_TIMELINE = {
  duration: "42분",
  segments: [
    {
      time: "00:00",
      kind: "agenda" as const,
      kindLabel: "안건",
      title: "캠페인 목표 확인",
      summary: "분기 목표와 채널·론칭 일정을 안건으로 공유했습니다.",
      bullets: ["신규 가입·활성화", "검색·소셜 비중", "론칭일 고정"],
      speakers: [
        { name: "김서연", said: "오늘은 목표와 채널 우선순위부터 맞춥니다." },
        { name: "박준호", said: "예산 상한도 같이 보죠." },
      ],
    },
    {
      time: "08:20",
      kind: "discussion" as const,
      kindLabel: "논의",
      title: "채널·콘텐츠",
      summary: "검색·소셜 비중과 랜딩·숏폼 제작 범위를 논의했습니다.",
      bullets: ["주 3편 숏폼", "랜딩 시안", "대행사 일정"],
      speakers: [
        { name: "박준호", said: "시안 확정일을 이틀 앞당기면 좋겠어요." },
      ],
    },
  ],
} as const;

/** 원문은 픽션. 화면에는 MaskedText 칩만 보이게 한다. */
export const HELP_FIG_MASKING = {
  meetingTitle: "한빛커머스 공동마케팅 킥오프",
  lines: [
    {
      side: "right" as const,
      speaker: HELP_FIG_SPEAKERS.a,
      time: "08:35",
      text: "대행사 일정은 메일로 받았고, 담당자 연락처도 같이 적어 둘게요.",
      mask: false,
    },
    {
      side: "right" as const,
      speaker: HELP_FIG_SPEAKERS.b,
      time: "10:12",
      text: "네. 김민수 매니저 번호는 010-2847-3916 이고, 메일은 seoyeon.lee@partner.co.kr 입니다.",
      mask: true,
    },
    {
      side: "left" as const,
      speaker: HELP_FIG_SPEAKERS.me,
      time: "14:50",
      text: "연락처는 부분 가림으로 두고, 눌러서 확인할 수 있게 맞출게요.",
      mask: false,
    },
  ],
} as const;
