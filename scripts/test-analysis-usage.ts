import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env" });
config({ path: ".env.local", override: true });

import { prisma } from "../src/lib/prisma";
import { ANALYSIS_MODE_POLICY } from "../src/lib/stt/analysis-mode";
import {
  ANALYSIS_GRACE_SEC,
  assertUploadQuota,
  getUploadQuotaStatus,
  grantMinuteCredit,
} from "../src/lib/stt/usage-quota";

async function main() {
  if (
    ANALYSIS_MODE_POLICY.standard.model !== "gpt-4o-mini-transcribe" ||
    ANALYSIS_MODE_POLICY.standard.speakerSplit ||
    ANALYSIS_MODE_POLICY.standard.forcedAlignment
  ) {
    throw new Error("일반 분석 모델 경로가 경량 정책과 다릅니다.");
  }
  if (
    ANALYSIS_MODE_POLICY.precision.model !== "gpt-transcribe" ||
    !ANALYSIS_MODE_POLICY.precision.speakerSplit ||
    ANALYSIS_MODE_POLICY.precision.forcedAlignment
  ) {
    throw new Error("화자 구분 경로가 API 단어 시각 재사용 정책과 다릅니다.");
  }
  const token = randomUUID().slice(0, 10);
  const user = await prisma.user.create({
    data: {
      email: `usage-test-${token}@example.invalid`,
      plan: "PRO",
    },
    select: { id: true },
  });
  try {
    const initial = await getUploadQuotaStatus(user.id);
    if (initial.monthlyLimitSec !== 1_000 * 60) {
      throw new Error("Pro 월 차감분이 1,000분이 아닙니다.");
    }
    if (initial.graceRemainingSec !== ANALYSIS_GRACE_SEC) {
      throw new Error("5분 유예가 적용되지 않았습니다.");
    }

    const standard = await assertUploadQuota({
      userId: user.id,
      meetingId: `usage-standard-${token}`,
      newDurationSec: 600,
      analysisMode: "standard",
    });
    if (standard.chargedSec !== 600) {
      throw new Error("일반 분석이 1배로 차감되지 않았습니다.");
    }
    await standard.finalize();

    const precision = await assertUploadQuota({
      userId: user.id,
      meetingId: `usage-precision-${token}`,
      newDurationSec: 600,
      analysisMode: "precision",
    });
    if (precision.chargedSec !== 600) {
      throw new Error("정밀 분석이 실제 오디오 길이와 다르게 차감됩니다.");
    }
    await precision.finalize();

    const duplicate = await assertUploadQuota({
      userId: user.id,
      meetingId: `usage-precision-${token}`,
      newDurationSec: 600,
      analysisMode: "precision",
    });
    await duplicate.finalize();

    const rows = await prisma.analysisUsage.findMany({
      where: { userId: user.id },
    });
    if (rows.length !== 2) {
      throw new Error("동일 meetingId가 이중 차감됐습니다.");
    }
    await grantMinuteCredit({
      userId: user.id,
      sec: 30 * 60,
      reason: "test-pack",
      reference: `usage-pack-${token}`,
    });
    await grantMinuteCredit({
      userId: user.id,
      sec: 30 * 60,
      reason: "test-pack-retry",
      reference: `usage-pack-${token}`,
    });
    const final = await getUploadQuotaStatus(user.id);
    if (final.usedSec !== 1_200) {
      throw new Error(`예상 사용량 1200초, 실제 ${final.usedSec}초`);
    }
    if (final.creditRemainingSec !== 30 * 60) {
      throw new Error("분 팩 충전이 멱등하게 한 번만 반영되지 않았습니다.");
    }
    console.log(
      JSON.stringify({
        ok: true,
        standardChargedSec: standard.chargedSec,
        precisionChargedSec: precision.chargedSec,
        usedSec: final.usedSec,
        graceSec: final.graceRemainingSec,
      }),
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
