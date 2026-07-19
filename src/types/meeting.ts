import type { WorkspaceId } from "@/lib/workspaces";

export type MeetingStatus = "completed" | "in_progress" | "scheduled";
export type MeetingSecurity = "protected" | "unprotected";

/** 회의록 화자 인식 방식. 비회원도 음성 톤 등으로 구분 가능. */
export type ParticipantRecognition = "member" | "guest" | "voice";

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
}
