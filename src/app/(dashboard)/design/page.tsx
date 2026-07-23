import { Suspense } from "react";

import { DesignLab } from "@/components/design/design-lab";
import { PageContainer } from "@/components/layout/page-container";
import { requireAdmin } from "@/lib/admin";

/** 개발전용. 트리거·조건부 UI 재현. */
export default async function DesignPage() {
  await requireAdmin();

  return (
    <PageContainer>
      <Suspense fallback={null}>
        <DesignLab />
      </Suspense>
    </PageContainer>
  );
}
