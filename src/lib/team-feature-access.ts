import "server-only";

import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import {
  isTeamFeatureEnabledForRole,
  TEAM_FEATURE_ADMIN_ONLY,
  TEAM_FEATURE_ENABLED,
} from "@/lib/feature-flags";

export type TeamFeatureFailure = {
  ok: false;
  status: 401 | 403;
  message: string;
};

export type TeamFeatureAccess =
  | TeamFeatureFailure
  | { ok: true; role: Role };

function unavailableMessage() {
  if (!TEAM_FEATURE_ENABLED) return "팀 기능은 현재 준비 중입니다.";
  if (TEAM_FEATURE_ADMIN_ONLY) return "팀 기능은 현재 관리자에게만 제공됩니다.";
  return "팀 기능을 사용할 수 없습니다.";
}

/**
 * DB의 최신 역할을 기준으로 팀 기능 접근을 판정한다.
 * JWT의 역할은 동기화 주기 동안 이전 값일 수 있으므로 팀 경계에서는 DB를
 * 다시 확인한다.
 */
export async function getTeamFeatureAccess(
  userId: string,
): Promise<TeamFeatureAccess> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, disabled: true },
  });
  if (!user || user.disabled) {
    return {
      ok: false,
      status: 401,
      message: "로그인이 필요합니다.",
    };
  }
  if (!isTeamFeatureEnabledForRole(user.role)) {
    return { ok: false, status: 403, message: unavailableMessage() };
  }
  return { ok: true, role: user.role };
}

export function teamFeatureFailureResponse(failure: TeamFeatureFailure) {
  return NextResponse.json(
    { ok: false, message: failure.message },
    { status: failure.status },
  );
}

/**
 * 팀 전용 API 공통 게이트. 인증뿐 아니라 최신 DB 역할과 비활성 상태도
 * 함께 검사하므로 클라이언트 플래그 우회나 오래된 JWT에 의존하지 않는다.
 */
export async function requireTeamFeatureUser() {
  const session = await requireUser();
  if (!session) {
    return {
      ok: false as const,
      status: 401 as const,
      message: "로그인이 필요합니다.",
    };
  }
  const access = await getTeamFeatureAccess(session.user.id);
  if (!access.ok) return access;
  return { ok: true as const, session, role: access.role };
}
