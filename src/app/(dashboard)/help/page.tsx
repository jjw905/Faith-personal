import { Mail, BookOpen, MessageCircle } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FAQ = [
  {
    q: "회의는 어떻게 기록하나요?",
    a: "회의 화면에서 실시간 녹음 시작 또는 파일 업로드를 선택하면 됩니다.",
  },
  {
    q: "개인정보는 어떻게 가려지나요?",
    a: "녹음·업로드 후 자동으로 감지해 마스킹합니다. 처리 상태는 상단 처리 상태 버튼에서 확인할 수 있습니다.",
  },
  {
    q: "타임라인 요약은 어디서 보나요?",
    a: "회의 기록에서 회의를 열면 녹음 구간별 안건, 논의, 결정, 후속 조치가 타임라인으로 정리됩니다.",
  },
  {
    q: "알림은 어디서 보나요?",
    a: "헤더 오른쪽 벨 아이콘을 누르면 알림 센터가 열립니다. 수신 설정은 계정 설정에서 변경합니다.",
  },
  {
    q: "회의록 보존 기간은 어디서 바꾸나요?",
    a: "왼쪽 메뉴의 시스템 설정에서 회의 보존, 기본 마스킹을 관리합니다.",
  },
];

export default function HelpPage() {
  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <PageHeader
          title="도움말"
          description="이용 방법과 자주 묻는 질문, 문의 안내입니다."
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <BookOpen className="h-5 w-5 text-primary" strokeWidth={1.75} />
              <CardTitle className="text-base">시작 가이드</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted">
              녹음·업로드부터 마스킹·회의록 확인까지 기본 흐름을 안내합니다.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <MessageCircle
                className="h-5 w-5 text-primary"
                strokeWidth={1.75}
              />
              <CardTitle className="text-base">FAQ</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted">
              자주 묻는 질문과 답변을 아래에 모아 두었습니다.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <Mail className="h-5 w-5 text-primary" strokeWidth={1.75} />
              <CardTitle className="text-base">문의</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted">
              support@faith.app 으로 연락해 주세요. (예시)
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">자주 묻는 질문</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-border py-0">
            {FAQ.map((item) => (
              <div key={item.q} className="py-4">
                <p className="text-sm font-medium text-foreground">{item.q}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {item.a}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
