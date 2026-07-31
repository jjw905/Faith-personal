import Link from "next/link";
import { ChevronLeft, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export function MeetingAccessNotice() {
  return (
    <div className="mx-auto flex min-h-[calc(100dvh-12rem)] max-w-lg flex-col items-center justify-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft text-foreground">
        <ShieldCheck className="h-7 w-7" strokeWidth={1.75} aria-hidden />
      </div>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground">
        참석 확인이 필요합니다
      </h1>
      <p className="mt-2 text-base leading-7 text-muted">
        회의 기록과 음성은 참석 확인을 저장한 뒤 열람할 수 있습니다.
        <br />
        팀 화면의 알림에서 확인을 완료해 주세요.
      </p>
      <Button
        asChild
        variant="secondary"
        className="mt-6 min-h-12 rounded-full px-5 text-base"
      >
        <Link href="/team">
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          팀 화면으로 돌아가기
        </Link>
      </Button>
    </div>
  );
}
