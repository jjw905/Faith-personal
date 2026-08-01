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
    title: "제품",
    items: [
      { id: "mission", title: "핵심 가치" },
      { id: "product", title: "제품 기능" },
    ],
  },
  {
    title: "제품 원칙",
    items: [
      { id: "security", title: "보안 설계" },
      { id: "accuracy", title: "품질 관리" },
    ],
  },
  {
    title: "안내",
    items: [
      { id: "team", title: "서비스 안내" },
      { id: "contact", title: "문의" },
    ],
  },
];

export const ABOUT_SECTIONS: AboutSection[] = [
  {
    id: "mission",
    title: "핵심 가치",
    items: [
      "회의의 핵심은 남기고, 정리하는 데 드는 시간은 줄여야 합니다.",
      "Faith는 화자 구분 받아쓰기부터 요약과 타임라인까지 회의의 흐름을 자동으로 구조화합니다.",
      "결정과 후속 조치를 빠르게 확인해 다음 업무로 이어지도록 돕습니다.",
    ],
  },
  {
    id: "product",
    title: "제품 기능",
    items: [
      "음성 파일을 업로드하면 받아쓰기, 화자 구분, 요약, 타임라인, 대화기록을 자동으로 생성합니다.",
      "회의록을 다시 들을 때 필요한 대목과 단어를 바로 확인하고, 메모와 함께 관리할 수 있습니다.",
      "개인정보 마스킹은 민감정보를 가려 공유 전 검토를 돕습니다.",
    ],
  },
  {
    id: "security",
    title: "보안 설계",
    items: [
      "개별 회의록은 운영자가 열람하지 않습니다. 정책 위반 여부는 자동 검사로 판단하며, 필요한 처리 이력은 감사 로그로 기록합니다.",
      "서비스 운영과 품질 개선에는 실패율과 처리 단계 등 내용이 아닌 지표만 사용합니다.",
      "팀 전용 콘텐츠와 감사 기록은 보안 키가 준비된 경우 팀별 암호화 정책을 적용합니다.",
      "자세한 처리 기준은 개인정보 처리방침과 운영정책 문서에서 확인할 수 있습니다.",
    ],
  },
  {
    id: "accuracy",
    title: "품질 관리",
    items: [
      "받아쓰기 결과는 모델 산출물을 기준으로 제공하며, 운영자가 대신 수정하지 않습니다.",
      "다화자, 잡음, 겹치는 발화 등 실제 회의 조건에서 정확도와 비용을 함께 검증합니다.",
      "검증 결과가 확인된 개선만 파이프라인에 반영합니다.",
    ],
  },
  {
    id: "team",
    title: "서비스 안내",
    items: [
      "현재는 개인 공간의 파일 업로드, 보관함, 분석 결과 열람을 중심으로 제공합니다.",
      "팀 워크스페이스와 실시간 회의 기능은 서비스 상태에 따라 순차적으로 제공됩니다.",
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
