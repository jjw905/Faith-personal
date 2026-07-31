export type OperationsCheckStatus = "ready" | "attention" | "paused";

export type OperationsCheck = {
  id:
    | "team-access"
    | "voice-transport"
    | "realtime-stt"
    | "file-storage"
    | "data-encryption"
    | "retention"
    | "external-sharing"
    | "audit-retention";
  label: string;
  status: OperationsCheckStatus;
  detail: string;
  action?: string;
};

export type OperationsReadiness = {
  generatedAt: string;
  checks: OperationsCheck[];
  summary: {
    ready: number;
    attention: number;
    paused: number;
  };
};
