# Faith

> 회의의 대화를 기록하고, 결정과 다음 행동까지 연결하는 AI 회의록 서비스

Faith는 회의 음성을 텍스트로 옮기는 데서 끝나지 않고, 회의의 핵심 내용을 다시 확인하고 실행할 수 있는 형태로 정리하는 웹 애플리케이션입니다.

## 핵심 경험

1. **Capture** — 오디오 업로드와 실시간 회의 기록
2. **Understand** — 음성 인식, 대화 구조화, 요약·키워드·타임라인 생성
3. **Review** — 회의록, 발화 흐름, 결정사항과 액션 아이템 확인
4. **Collaborate** — 개인 회의와 팀 워크스페이스, 역할별 접근 제어
5. **Reuse** — 검색, 재생, 개인정보 마스킹, 다양한 형식의 회의 결과 내보내기

## AI 처리 파이프라인

```text
Audio
  → Chunked STT
  → Dialogue & Speaker Structure
  → Summary / Keywords / Timeline
  → Decisions / Action Items
  → Search, Share & Export
```

긴 오디오도 청크 단위로 처리하며, 각 단계의 진행 상태와 오류를 사용자에게 보여줍니다. 회의의 대화 구간과 주제·결정·액션은 모델 기반 구조화 결과를 사용합니다.

## 주요 구현 범위

- 업로드 음성의 청크 기반 STT 및 진행률 표시
- 회의 요약, 키워드, 타임라인, 결정사항, 액션 아이템 생성
- 개인 회의와 팀 회의 워크스페이스
- 관리자·팀원 역할 및 회의 접근 권한 관리
- 개인정보 마스킹과 회의 공유·보존 정책
- 실시간 음성 회의와 실시간 받아쓰기 흐름
- 회의 원본 파일 보관 및 TXT, Markdown, JSON, CSV, SRT, VTT, DOCX, PDF 내보내기
- AI 사용량·처리 상태·실패 단계 추적

## 기술 스택

- **Frontend / Backend:** Next.js 16 App Router, React 19, TypeScript
- **Styling:** Tailwind CSS v4, shadcn/ui 스타일 컴포넌트
- **Authentication:** Auth.js, Prisma Adapter
- **Database:** PostgreSQL, Prisma ORM
- **AI:** OpenAI Speech-to-Text 및 텍스트 구조화 모델
- **Realtime:** LiveKit, WebRTC
- **Storage:** Google Cloud Storage 또는 S3 호환 오브젝트 스토리지
- **Documents:** PDF, DOCX, CSV, SRT/VTT export pipeline

## 설계에 둔 초점

- **End-to-End 제품 흐름:** 업로드부터 회의 결과 확인까지 하나의 자동 파이프라인으로 연결
- **명확한 진행 상태:** 처리 중인 단계와 실패 원인을 사용자가 확인할 수 있도록 구성
- **접근 제어:** 개인·팀·역할 단위로 회의와 민감한 콘텐츠의 접근 범위를 분리
- **운영 고려:** AI 사용량, 저장소, 보존 기간, 로컬·운영 환경의 차이를 코드 수준에서 관리

## 프로젝트 상태

Faith는 AI 회의록 제품의 핵심 흐름을 검증하기 위한 지속 개발 프로젝트입니다. 현재는 회의 분석 파이프라인, 협업 기능, 개인정보 보호, 실시간 기록 흐름을 중심으로 안정화하고 있습니다.

운영 배포는 GitHub Actions와 Cloud Run을 사용합니다. 환경별 설정·비밀값은 저장소에 두지 않습니다.
