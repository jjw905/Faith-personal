import "server-only";

import {
  REALTIME_FEATURE_ENABLED,
  TEAM_FEATURE_ADMIN_ONLY,
  TEAM_FEATURE_ENABLED,
} from "@/lib/feature-flags";
import { evaluateKmsRuntime } from "@/lib/kms-runtime-policy";
import { isLiveTeamSttRuntimeAvailable } from "@/lib/team/live-stt";
import type {
  OperationsCheck,
  OperationsReadiness,
} from "@/lib/operations-readiness-types";

export type {
  OperationsCheck,
  OperationsCheckStatus,
  OperationsReadiness,
} from "@/lib/operations-readiness-types";

function configured(value: string | undefined, placeholders: string[] = []) {
  const normalized = value?.trim();
  return Boolean(
    normalized && !placeholders.some((placeholder) => normalized === placeholder),
  );
}

function statusForConfigured(
  ready: boolean,
  detail: string,
  action: string,
): OperationsCheck {
  return {
    id: "file-storage",
    label: "파일 보관",
    status: ready ? "ready" : "attention",
    detail,
    ...(ready ? {} : { action }),
  };
}

export function getOperationsReadiness(
  now = new Date(),
): OperationsReadiness {
  const liveKitConfigured =
    configured(process.env.LIVEKIT_URL, ["wss://rtc.example.com"]) &&
    configured(process.env.LIVEKIT_API_KEY) &&
    configured(process.env.LIVEKIT_API_SECRET);
  const storageConfigured =
    configured(process.env.DO_SPACES_ENDPOINT) &&
    configured(process.env.DO_SPACES_BUCKET) &&
    configured(process.env.DO_SPACES_KEY) &&
    configured(process.env.DO_SPACES_SECRET);
  const maintenanceSecretConfigured = configured(
    process.env.MAINTENANCE_CRON_SECRET,
  );
  const kms = evaluateKmsRuntime();

  const checks: OperationsCheck[] = [
    {
      id: "team-access",
      label: "팀 기능 접근",
      status: !TEAM_FEATURE_ENABLED
        ? "paused"
        : TEAM_FEATURE_ADMIN_ONLY
          ? "attention"
          : "ready",
      detail: TEAM_FEATURE_ENABLED
        ? TEAM_FEATURE_ADMIN_ONLY
          ? "현재 관리자 계정에만 제공 중이며 일반 사용자 오픈 전환이 필요합니다."
          : "팀 기능이 사용자에게 제공되고 있습니다."
        : "팀 기능이 운영 플래그로 잠겨 있습니다.",
      ...(!TEAM_FEATURE_ENABLED
        ? { action: "NEXT_PUBLIC_TEAM_FEATURE_ENABLED=true로 설정하세요." }
        : TEAM_FEATURE_ADMIN_ONLY
          ? {
              action:
                "출시할 때 NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY=false로 설정하세요.",
            }
          : {}),
    },
    {
      id: "voice-transport",
      label: "온라인 음성 통화",
      status: liveKitConfigured ? "ready" : "attention",
      detail: liveKitConfigured
        ? "LiveKit 연결 설정이 확인되었습니다."
        : "LiveKit 서버 설정이 없어 온라인 통화를 시작할 수 없습니다.",
      ...(liveKitConfigured
        ? {}
        : { action: "LIVEKIT_URL, API key, secret을 설정하세요." }),
    },
    {
      id: "realtime-stt",
      label: "실시간 받아쓰기",
      status: !REALTIME_FEATURE_ENABLED
        ? "paused"
        : isLiveTeamSttRuntimeAvailable() && liveKitConfigured
          ? "ready"
          : "attention",
      detail: !REALTIME_FEATURE_ENABLED
        ? "검증 기간 동안 중지되어 있습니다. 음성 통화는 계속 사용할 수 있습니다."
        : isLiveTeamSttRuntimeAvailable() && liveKitConfigured
          ? "실시간 받아쓰기 연결 설정이 확인되었습니다."
          : "실시간 받아쓰기 연결 설정을 확인해야 합니다.",
      ...(!REALTIME_FEATURE_ENABLED
        ? {
            action:
              "연결 검증 후 NEXT_PUBLIC_REALTIME_FEATURE_ENABLED=true로 설정하세요.",
          }
        : isLiveTeamSttRuntimeAvailable() && liveKitConfigured
          ? {}
          : { action: "OPENAI_API_KEY와 LiveKit 설정을 확인하세요." }),
    },
    statusForConfigured(
      storageConfigured,
      storageConfigured
        ? "Spaces 보관 설정이 확인되었습니다."
        : "회의 원본을 보관할 Spaces 설정이 부족합니다.",
      "DO_SPACES endpoint, bucket, key, secret을 설정하세요.",
    ),
    {
      id: "data-encryption",
      label: "콘텐츠·감사 암호화 키",
      status: kms.allowed ? "ready" : "attention",
      detail: kms.allowed
        ? "운영 KMS의 콘텐츠 키와 감사 키 연결이 확인되었습니다."
        : "운영 KMS 키가 연결되지 않아 팀 보안 키를 제공할 수 없습니다.",
      ...(kms.allowed
        ? {}
        : {
            action:
              "AWS_KMS_ENABLED, AWS_KMS_RUNTIME_ENV, AWS_KMS_CONTENT_KEY_ARN, AWS_KMS_AUDIT_KEY_ARN 설정을 확인하세요.",
          }),
    },
    {
      id: "retention",
      label: "팀 기록 보존",
      status: maintenanceSecretConfigured ? "ready" : "attention",
      detail: maintenanceSecretConfigured
        ? "팀 보존기간 자동 작업을 스케줄러로 실행할 수 있습니다."
        : "관리자 수동 실행은 가능하지만 스케줄러용 키가 아직 없습니다.",
      ...(maintenanceSecretConfigured
        ? {}
        : { action: "MAINTENANCE_CRON_SECRET을 설정하고 주기 작업에 연결하세요." }),
    },
    {
      id: "external-sharing",
      label: "외부 공유",
      status: "paused",
      detail:
        "공개 열람 링크가 준비될 때까지 외부 공유를 중지합니다. 팀 멤버 공유는 계속됩니다.",
    },
    {
      id: "audit-retention",
      label: "감사 로그 보존",
      status: "ready",
      detail: "감사 로그는 최소 365일 보관되며 보존 작업에서 정리됩니다.",
    },
  ];

  return {
    generatedAt: now.toISOString(),
    checks,
    summary: {
      ready: checks.filter((check) => check.status === "ready").length,
      attention: checks.filter((check) => check.status === "attention").length,
      paused: checks.filter((check) => check.status === "paused").length,
    },
  };
}
