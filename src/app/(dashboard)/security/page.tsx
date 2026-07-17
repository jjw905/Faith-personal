import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SecurityPage() {
  return (
    <PageContainer>
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader
          title="보안 설정"
          description={`암호화, RBAC 정책을 구성합니다. 개인정보 마스킹 검증은 좌측 "개인정보 마스킹" 메뉴를 사용하세요.`}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">준비 중</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted">
            암호화 키 관리, 역할 기반 접근 제어(RBAC) 설정은 이후 단계에서
            연결됩니다.
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
