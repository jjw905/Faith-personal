import { Suspense } from "react";

import { DesignLab } from "@/components/design/design-lab";
import { AdminPageChrome } from "@/components/admin/admin-page-chrome";
import { requireAdmin } from "@/lib/admin";

/** 개발전용. 트리거·조건부 UI 재현. */
export default async function DesignPage() {
  await requireAdmin();

  return (
    <AdminPageChrome title="디자인" maxWidth="max-w-7xl">
      <Suspense fallback={null}>
        <DesignLab />
      </Suspense>
    </AdminPageChrome>
  );
}
