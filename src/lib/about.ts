import { docsTextMatches } from "@/lib/docs-search";

export type AboutNavGroup = {
  title: string;
  items: { id: string; title: string }[];
};

export type AboutSection = {
  id: string;
  title: string;
  items: string[];
};

export const ABOUT_NAV: AboutNavGroup[] = [
  {
    title: "소개",
    items: [
      { id: "mission", title: "만드는 이유" },
      { id: "product", title: "하는 일" },
    ],
  },
  {
    title: "만드는 방식",
    items: [
      { id: "security", title: "보안을 대하는 방식" },
      { id: "accuracy", title: "정확도를 대하는 방식" },
    ],
  },
  {
    title: "팀",
    items: [
      { id: "team", title: "운영팀" },
      { id: "contact", title: "문의" },
    ],
  },
];

export const ABOUT_SECTIONS: AboutSection[] = [
  {
    id: "mission",
    title: "만드는 이유",
    items: [
      "회의는 남겨야 하지만, 남긴 기록이 그대로 유출 위험이 되는 경우가 많습니다.",
      "Faith는 회의를 기록하고 정리하는 과정에서 개인정보 노출 걱정을 줄이는 것을 목표로 만들고 있습니다.",
      "지금은 결제 수요조사 기간으로, 업로드 분석, 보관함, 분석 결과 보기 중심으로 제품을 검증하고 있습니다.",
    ],
  },
  {
    id: "product",
    title: "하는 일",
    items: [
      "음성 파일을 올리면 받아쓰기, 화자 구분, 요약, 타임라인, 대화기록을 자동으로 만들어 드립니다.",
      "잘못 인식된 단어는 교정 추천으로 보여주고, 누르면 그 자리에서 바로 반영됩니다.",
      "대화기록의 개인정보는 기본적으로 가려서 보여주고, 가림 방식은 언제든 바꿀 수 있습니다.",
    ],
  },
  {
    id: "security",
    title: "보안을 대하는 방식",
    items: [
      "운영진은 이용자 개별 회의록 내용을 열어보지 않습니다. 정책 위반 여부는 사람이 읽지 않고 자동 검사로만 판단합니다.",
      "자동 검사에서 걸린 기록만 운영팀이 재처리 여부를 결정하며, 그 처리 이력은 감사 로그로 남습니다.",
      "서비스 운영과 품질 개선을 위한 통계는 실패율, 처리 단계처럼 내용을 포함하지 않는 지표만 모읍니다.",
      "자세한 처리 기준은 개인정보 처리방침과 운영정책 문서에서 확인할 수 있습니다.",
    ],
  },
  {
    id: "accuracy",
    title: "정확도를 대하는 방식",
    items: [
      "받아쓰기 결과는 모델이 낸 원문을 그대로 두고, 교정은 추천으로만 보여줍니다. 운영진이 결과를 대신 고쳐 쓰지 않습니다.",
      "실제 다화자 회의 샘플로 정확도와 비용을 함께 측정하고, 개선이 확인된 경우에만 파이프라인에 반영합니다.",
      "어려운 오디오(다화자, 잡음, 겹치는 발화)일수록 더 자주 검증합니다.",
    ],
  },
  {
    id: "team",
    title: "운영팀",
    items: [
      "Faith는 소규모 운영팀이 만들고 있습니다.",
      "아직 매출이 없는 수요조사 단계이며, 그 기간과 목적은 가입 시 안내되는 약관에 따릅니다.",
    ],
  },
  {
    id: "contact",
    title: "문의",
    items: [],
  },
];

export function searchAboutSections(query: string): AboutSection[] {
  const q = query.trim();
  if (!q) return ABOUT_SECTIONS;
  return ABOUT_SECTIONS.filter((section) =>
    docsTextMatches([section.title, ...section.items].join(" "), q),
  );
}
