import { NextResponse } from "next/server";

import { enforceAuthRateLimit } from "@/lib/rate-limit";
import {
  getTeamMember,
  writeTeamAudit,
} from "@/lib/team-permissions";
import { provisionTeamSecurityKeys } from "@/lib/team-kms";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const limited = enforceAuthRateLimit(request, "team-kms-create", 3, 10 * 60_000);
  if (limited) return limited;

  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { teamId } = await context.params;
  const membership = await getTeamMember(teamId, session.user.id);
  if (!membership || membership.role !== "OWNER") {
    return NextResponse.json(
      { ok: false, message: "팀 대표만 팀 보안 키를 만들 수 있습니다." },
      { status: 403 },
    );
  }

  try {
    const securityKey = await provisionTeamSecurityKeys(teamId);
    await writeTeamAudit({
      teamId,
      actorId: session.user.id,
      action: "team.security_key_provisioned",
      metadata: {
        status: securityKey.status,
        region: securityKey.region,
      },
      request,
    });
    return NextResponse.json({
      ok: true,
      securityKey: {
        status: securityKey.status,
        region: securityKey.region,
        createdAt: securityKey.createdAt,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "팀 보안 키를 만들지 못했습니다.",
      },
      { status: 503 },
    );
  }
}
