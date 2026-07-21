import { DesignLab } from "@/components/design/design-lab";
import { PageContainer } from "@/components/layout/page-container";
import { requireAdmin } from "@/lib/admin";

/** 개발전용 디자인 미리보기. */
export default async function DesignPage() {
  await requireAdmin();

  return (
    <PageContainer>
      <DesignLab />
    </PageContainer>
  );
}
