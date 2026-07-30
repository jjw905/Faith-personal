import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { SurveyForm } from "@/components/survey/survey-form";
import { auth } from "@/auth";
import { hasCompletedSurvey, SURVEY_UNLOCKED_MONTHLY_MINUTES } from "@/lib/stt/usage-quota";

export const dynamic = "force-dynamic";

export default async function SurveyPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const completed = await hasCompletedSurvey(session.user.id);

  return (
    <PageContainer soft>
      <div className="mx-auto w-full max-w-xl space-y-6">
        <header className="min-w-0 space-y-1.5">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
            {completed ? "설문 참여 완료" : "설문에 참여해 주세요"}
          </h1>
          <p className="text-base text-muted">
            {completed
              ? "소중한 의견 감사합니다. 다음 개선에 반영하겠습니다."
              : `1분이면 끝나는 짧은 설문입니다. 응답을 제출하면 이번 주기 분석 가능 시간이 최대 ${SURVEY_UNLOCKED_MONTHLY_MINUTES}분으로 늘어납니다.`}
          </p>
        </header>

        <SurveyForm initialCompleted={completed} />
      </div>
    </PageContainer>
  );
}
