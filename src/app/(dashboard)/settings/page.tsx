import { Settings } from "lucide-react";

import { PageSkeleton } from "@/components/layout/page-skeleton";

export default function SettingsPage() {
  return (
    <PageSkeleton
      title="시스템 설정"
      description="워크스페이스, 보존 정책 등 시스템 환경을 구성합니다. 개인 계정 설정은 좌측 하단 계정 메뉴에서 관리하세요."
      icon={Settings}
    />
  );
}
