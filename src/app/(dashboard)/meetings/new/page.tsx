import { AudioUploadZone } from "@/components/dashboard/audio-upload-zone";
import { PageContainer } from "@/components/layout/page-container";

export default function NewMeetingPage() {
  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-2xl space-y-6 py-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            새 회의
          </h1>
          <p className="mt-1 text-sm text-muted">
            오디오를 업로드하거나 실시간 녹음을 시작하세요. 저장 시 개인정보는
            자동으로 마스킹됩니다.
          </p>
        </div>
        <AudioUploadZone />
      </div>
    </PageContainer>
  );
}
