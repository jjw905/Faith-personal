import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/marketing/container";

export const metadata: Metadata = {
  title: "개인정보 처리방침 · Faith",
  description:
    "Faith가 수집하는 개인정보 항목, 이용 목적, 보관 및 파기, 보호 조치와 이용자 권리를 안내합니다.",
};

type Section = {
  id?: string;
  title: string;
  items: string[];
};

const SECTIONS: Section[] = [
  {
    title: "1. 수집하는 개인정보 항목",
    items: [
      "계정 정보: 이름, 이메일, 비밀번호",
      "회의 데이터: 음성 녹음, 변환된 회의록 텍스트, 참석자 및 화자 정보",
      "민감정보: 주민번호, 전화번호, 이메일, 카드번호 등 (감지 즉시 마스킹 처리)",
      "이용 기록: 접속 로그, 열람 및 편집 활동 로그",
    ],
  },
  {
    title: "2. 개인정보의 수집 및 이용 목적",
    items: [
      "회의 음성의 실시간 텍스트 변환 및 회의록 생성",
      "개인정보 자동 감지 및 마스킹 처리",
      "회의 내용 자동 요약 제공",
      "회의록의 안전한 저장과 역할 기반 접근 권한 관리",
      "서비스 품질 개선 및 보안 이상 탐지",
    ],
  },
  {
    title: "3. 개인정보의 보관 및 파기",
    items: [
      "수집 목적 달성 시 지체 없이 파기",
      "관계 법령에서 정한 기간 동안만 보관 후 파기",
      "마스킹된 원문은 권한이 부여된 이용자만 열람 가능",
      "파기 시 복구 불가능한 방식으로 안전하게 삭제",
    ],
  },
  {
    title: "4. 개인정보의 보호 조치",
    items: [
      "전송 구간 및 저장 구간 암호화 적용",
      "역할 기반 접근 통제(RBAC)로 접근 권한 최소화",
      "모든 열람 및 편집에 대한 활동 로그 기록과 감사",
      "규칙과 NER 하이브리드 방식의 민감정보 자동 마스킹",
    ],
  },
  {
    title: "5. 제3자 제공 및 처리 위탁",
    items: [
      "원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않음",
      "제공이 필요한 경우 사전에 목적과 항목을 고지하고 동의 획득",
      "처리 위탁 시 수탁자와 보안 요건을 포함한 계약 체결",
    ],
  },
  {
    title: "6. 이용자의 권리",
    items: [
      "개인정보 열람, 정정, 삭제, 처리정지 요청 가능",
      "회의록 및 마스킹 해제 이력에 대한 확인 요청 가능",
      "권리 행사는 문의처를 통해 접수하며 지체 없이 처리",
    ],
  },
  {
    title: "7. 개인정보 보호책임자 및 문의처",
    items: [
      "개인정보 보호책임자: Faith 보안팀",
      "문의: support@faith.app",
      "접수된 요청은 관련 법령에 따라 신속히 처리",
    ],
  },
];

const TERMS: Section = {
  id: "terms",
  title: "이용약관 요약",
  items: [
    "Faith는 안전한 회의록 작성 및 개인정보 마스킹 서비스를 제공합니다.",
    "이용자는 회의 참석자의 동의 등 관련 법령과 사내 정책을 준수해야 합니다.",
    "서비스로 생성된 회의록의 관리 책임은 이용 조직에 있습니다.",
    "서비스는 사전 고지 후 기능이 변경되거나 중단될 수 있습니다.",
  ],
};

function PolicySection({ section }: { section: Section }) {
  return (
    <section id={section.id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold text-foreground">{section.title}</h2>
      <ul className="mt-3 space-y-2">
        {section.items.map((item) => (
          <li
            key={item}
            className="relative pl-5 text-[15px] leading-relaxed text-muted before:absolute before:left-0 before:top-2.5 before:h-1.5 before:w-1.5 before:rounded-full before:bg-border-strong"
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border/40">
        <Container className="flex h-16 items-center sm:h-[4.5rem]">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-foreground"
          >
            Faith
          </Link>
        </Container>
      </header>

      <main className="flex-1 py-16 sm:py-20">
        <Container className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            개인정보 처리방침
          </h1>
          <p className="mt-3 text-sm text-muted">시행일: 2026년 1월 1일</p>
          <p className="mt-6 text-[15px] leading-relaxed text-muted">
            Faith(이하 &ldquo;서비스&rdquo;)는 이용자의 개인정보를 중요하게
            생각하며, 회의 음성 기록과 개인정보 마스킹이라는 서비스 특성에 맞춰
            아래와 같이 개인정보를 처리합니다.
          </p>

          <div className="mt-12 space-y-10">
            {SECTIONS.map((s) => (
              <PolicySection key={s.title} section={s} />
            ))}
            <PolicySection section={TERMS} />
          </div>

          <div className="mt-16 border-t border-border pt-6">
            <Link
              href="/"
              className="text-sm font-semibold text-foreground hover:underline"
            >
              ← 홈으로 돌아가기
            </Link>
          </div>
        </Container>
      </main>
    </div>
  );
}
