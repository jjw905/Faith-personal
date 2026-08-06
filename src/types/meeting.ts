import type { WorkspaceId } from "@/lib/workspaces";

export type MeetingStatus = "completed" | "in_progress" | "scheduled";
export type MeetingSecurity = "protected" | "unprotected";
/** 기록 생성 경로. 실시간 회화 vs 파일 업로드. */
export type MeetingCapture = "live" | "upload";

/** 회의록 화자 인식 방식. 비회원도 음성 톤 등으로 구분 가능. */
export type ParticipantRecognition = "member" | "guest" | "voice";

/** 분석 중(기록 목록용). 대기열 빠른순 정렬·진행 표시. */
export type MeetingProcessInfo = {
  phase: "transcribing" | "structuring";
  progressPercent: number;
  stageLabel?: string | null;
  waiting?: boolean;
  jobStatus?: "queued" | "running" | null;
  /** 앞에 남은 작업 수. 0이면 곧 시작 */
  queueAhead?: number | null;
};

export interface Participant {
  id: string;
  name: string;
  initials: string;
  color: string;
  /** 이 사이트 회원 여부. 기본 false(외부). */
  isMember?: boolean;
  /** 회의 진행자(호스트) 여부. */
  isHost?: boolean;
  /** 녹취 시 화자 구분 방식. */
  recognition?: ParticipantRecognition;
  /** 톤/호칭 등 인식 힌트. */
  recognitionNote?: string;
  /** 이 사람이 회의에서 한 일·발언 한 줄 요약. */
  summary?: string;
  /** 역할·담당·주제 태그. */
  tags?: string[];
}

export interface Meeting {
  id: string;
  title: string;
  /** 회의 태그 (목록·상세에 표시). */
  tags: string[];
  /** AI 요약 키워드 태그. */
  summaryTags: string[];
  date: string;
  duration: string;
  participants: Participant[];
  status: MeetingStatus;
  security: MeetingSecurity;
  /** 팀 공유 또는 개인 전용. */
  workspace: WorkspaceId;
  /** 실시간 회화 / 업로드. 없으면 id·태그로 추론. */
  capture?: MeetingCapture;
  /** 분석 중일 때 진행·대기 정보 (기록 목록). */
  process?: MeetingProcessInfo;
  /**
   * 다시듣기 원본.
   * - `/samples/...` 공개 샘플
   * - `.data/stt-bench` 상대 파일명 (예: `ktv-briefing-20251231.mp3`)
   */
  replayAudio?: string;
}
