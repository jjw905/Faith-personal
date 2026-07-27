import { prisma } from "@/lib/prisma";

/** 만료된 수동 등급·정지를 일괄 해제한다. */
export async function expireManualOverrides() {
  const now = new Date();
  await Promise.all([
    prisma.user.updateMany({
      where: { disabled: true, disabledUntil: { lte: now } },
      data: { disabled: false, disabledUntil: null },
    }),
    prisma.user.updateMany({
      where: { plan: "PRO", planUntil: { lte: now } },
      data: { plan: "FREE", planUntil: null },
    }),
  ]);
}

/** 특정 사용자의 만료된 정지·PRO 기간만 해제한다. 로그인/세션 sync용. */
export async function expireManualOverridesForUser(userId: string) {
  const now = new Date();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      disabled: true,
      disabledUntil: true,
      plan: true,
      planUntil: true,
    },
  });
  if (!user) return;

  const data: {
    disabled?: boolean;
    disabledUntil?: null;
    plan?: "FREE";
    planUntil?: null;
  } = {};

  if (
    user.disabled &&
    user.disabledUntil &&
    user.disabledUntil.getTime() <= now.getTime()
  ) {
    data.disabled = false;
    data.disabledUntil = null;
  }
  if (
    user.plan === "PRO" &&
    user.planUntil &&
    user.planUntil.getTime() <= now.getTime()
  ) {
    data.plan = "FREE";
    data.planUntil = null;
  }

  if (Object.keys(data).length === 0) return;
  await prisma.user.update({ where: { id: userId }, data });
}
