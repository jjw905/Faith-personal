import { docsTextMatches } from "@/lib/docs-search";

export type LegalSection = {
  id: string;
  title: string;
  items: string[];
  group: "privacy" | "terms";
};

/** 개인정보 처리방침 + 이용약관 요약. */
export const LEGAL_SECTIONS: LegalSection[] = [
  {
    id: "collect",
    group: "privacy",
    title: "수집하는 개인정보 항목",
    items: [
      "계정 정보: 이름, 이메일, 비밀번호",
      "회의 데이터: 음성 녹음, 변환된 회의록 텍스트, 참석자 및 화자 정보",
      "민감정보: 주민번호, 전화번호, 이메일, 카드번호 등 (감지 즉시 마스킹 처리)",
      "이용 기록: 접속 로그, 열람 및 편집 활동 로그",
    ],
  },
  {
    id: "purpose",
    group: "privacy",
    title: "개인정보의 수집 및 이용 목적",
    items: [
      "회의 음성의 실시간 텍스트 변환 및 회의록 생성",
      "개인정보 자동 감지 및 마스킹 처리",
      "회의 내용 자동 요약 제공",
      "회의록의 안전한 저장과 역할 기반 접근 권한 관리",
      "서비스 품질 개선 및 보안 이상 탐지",
    ],
  },
  {
    id: "retention",
    group: "privacy",
    title: "개인정보의 보관 및 파기",
    items: [
      "수집 목적 달성 시 지체 없이 파기",
      "관계 법령에서 정한 기간 동안만 보관 후 파기",
      "마스킹된 원문은 권한이 부여된 이용자만 열람 가능",
      "파기 시 복구 불가능한 방식으로 안전하게 삭제",
    ],
  },
  {
    id: "protection",
    group: "privacy",
    title: "개인정보의 보호 조치",
    items: [
      "전송 구간 및 저장 구간 암호화 적용",
      "역할 기반 접근 통제(RBAC)로 접근 권한 최소화",
      "모든 열람 및 편집에 대한 활동 로그 기록과 감사",
      "규칙과 NER 하이브리드 방식의 민감정보 자동 마스킹",
    ],
  },
  {
    id: "third-party",
    group: "privacy",
    title: "제3자 제공 및 처리 위탁",
    items: [
      "원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않음",
      "제공이 필요한 경우 사전에 목적과 항목을 고지하고 동의 획득",
      "처리 위탁 시 수탁자와 보안 요건을 포함한 계약 체결",
    ],
  },
  {
    id: "rights",
    group: "privacy",
    title: "이용자의 권리",
    items: [
      "개인정보 열람, 정정, 삭제, 처리정지 요청 가능",
      "회의록 및 마스킹 해제 이력에 대한 확인 요청 가능",
      "권리 행사는 문의처를 통해 접수하며 지체 없이 처리",
    ],
  },
  {
    id: "contact",
    group: "privacy",
    title: "개인정보 보호책임자 및 문의처",
    items: [
      "개인정보 보호책임자: Faith 보안팀",
      "문의: support@faith.app",
      "접수된 요청은 관련 법령에 따라 신속히 처리",
    ],
  },
  {
    id: "terms",
    group: "terms",
    title: "이용약관 요약",
    items: [
      "Faith는 안전한 회의록 작성 및 개인정보 마스킹 서비스를 제공합니다.",
      "이용자는 회의 참석자의 동의 등 관련 법령과 사내 정책을 준수해야 합니다.",
      "서비스로 생성된 회의록의 관리 책임은 이용 조직에 있습니다.",
      "서비스는 사전 고지 후 기능이 변경되거나 중단될 수 있습니다.",
    ],
  },
];

export const LEGAL_NAV = [
  {
    title: "개인정보 처리방침",
    items: LEGAL_SECTIONS.filter((s) => s.group === "privacy").map((s) => ({
      id: s.id,
      title: s.title,
    })),
  },
  {
    title: "이용약관",
    items: LEGAL_SECTIONS.filter((s) => s.group === "terms").map((s) => ({
      id: s.id,
      title: s.title,
    })),
  },
] as const;

export function searchLegalSections(query: string): LegalSection[] {
  const q = query.trim();
  if (!q) return LEGAL_SECTIONS;
  return LEGAL_SECTIONS.filter((section) => {
    if (docsTextMatches(section.title, q)) return true;
    return section.items.some((item) => docsTextMatches(item, q));
  });
}
