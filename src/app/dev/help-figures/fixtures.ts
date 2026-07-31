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
      title: "주간 보안 싱크",
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
      title: "주간 보안 싱크",
      tags: ["마스킹", "권한", "배포"],
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
      title: "범위 확인",
      summary: "이번 주 다룰 보안 점검 범위를 공유했습니다.",
      bullets: ["자동 마스킹 기본값", "검수 큐 분리", "배포 일정"],
      speakers: [
        { name: "김서연", said: "오늘은 마스킹과 배포 일정부터 맞춥니다." },
        { name: "박준호", said: "검수 큐 SLA도 같이 보죠." },
      ],
    },
    {
      time: "08:20",
      kind: "discussion" as const,
      kindLabel: "논의",
      title: "마스킹 규칙",
      summary: "전화·이메일 감지와 구어체 예외를 논의했습니다.",
      bullets: ["부분 가림 유지", "예외는 검수 큐", "샘플 재검증"],
      speakers: [
        { name: "박준호", said: "끊어 읽힌 번호도 잡히는지 확인해 주세요." },
      ],
    },
  ],
} as const;

/** 원문은 픽션. 화면에는 MaskedText 칩만 보이게 한다. */
export const HELP_FIG_MASKING = {
  meetingTitle: "주간 보안 싱크",
  lines: [
    {
      side: "left" as const,
      speaker: HELP_FIG_SPEAKERS.a,
      time: "08:35",
      text: "현재 규칙이 전화·이메일은 잘 잡는데, 구어체 변형이 빠져 있어요.",
      mask: false,
    },
    {
      side: "left" as const,
      speaker: HELP_FIG_SPEAKERS.b,
      time: "10:12",
      text: "맞아요. 테스트할 때 010-2847-3916 같은 것도 끊어 말하면 놓칠 수 있어요.",
      mask: true,
    },
    {
      side: "right" as const,
      speaker: HELP_FIG_SPEAKERS.me,
      time: "14:50",
      text: "부분 가림으로 두고, 눌러서 원문 확인하는 흐름으로 맞출게요.",
      mask: false,
    },
  ],
} as const;
