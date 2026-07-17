import { Container } from "@/components/marketing/container";

const FEATURES = [
  {
    title: "개인정보 마스킹",
    desc: "주민번호, 전화, 이메일, 카드번호를 규칙과 NER로 자동 감지하고 가립니다.",
  },
  {
    title: "녹음 기록하기",
    desc: "회의를 녹음하고 자동 요약, 검색 가능한 회의록으로 저장합니다.",
  },
  {
    title: "직원 관리",
    desc: "역할 기반 권한과 팀 활동 로그로 조직 전체를 안전하게 운영하세요.",
  },
];

/** 기능 한 칸. */
function FeatureItem({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="px-2 sm:px-6">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-3 text-sm leading-relaxed text-muted">{desc}</p>
    </div>
  );
}

/** 기능 소개 섹션 — 옅은 회색 배경, 아이콘 없이 3분할. */
export function FeatureSection() {
  return (
    <section id="features" className="bg-surface py-24">
      <Container>
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          민감정보는 가리고, 대화는 그대로.
        </h2>

        <div className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
          {FEATURES.map((f) => (
            <FeatureItem key={f.title} title={f.title} desc={f.desc} />
          ))}
        </div>
      </Container>
    </section>
  );
}
