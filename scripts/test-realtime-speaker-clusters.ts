import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prisma } from "../src/lib/prisma";
import { requireAudioToolPath } from "../src/lib/stt/local-tools";
import {
  assignRealtimeSpeakerCluster,
  purgeExpiredRealtimeSpeakerClusters,
} from "../src/lib/stt/realtime/speaker-clusters";

const SOURCE = ".data/stt-bench/ktv-briefing-20251231.mp3";

function clip(dir: string, name: string, startSec: number, durationSec: number) {
  const path = join(dir, `${name}.wav`);
  execFileSync(requireAudioToolPath("ffmpeg"), [
    "-nostdin",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    String(startSec),
    "-t",
    String(durationSec),
    "-i",
    SOURCE,
    "-ac",
    "1",
    "-ar",
    "16000",
    path,
  ]);
  return readFileSync(path);
}

async function main() {
  const user = await prisma.user.findFirst({ select: { id: true } });
  if (!user) throw new Error("로컬 테스트 사용자가 없습니다.");
  const dir = mkdtempSync(join(tmpdir(), "faith-speaker-cluster-test-"));
  const meetingId = `speaker-cluster-test-${Date.now()}`;
  const session = await prisma.realtimeSttSession.create({
    data: {
      meetingId,
      runId: meetingId,
      userId: user.id,
      title: "single microphone cluster test",
      speakerTrackingEnabled: true,
    },
  });
  try {
    const host1 = await assignRealtimeSpeakerCluster({
      sessionId: session.id,
      itemId: "host-1",
      audioBytes: clip(dir, "host-1", 34.1, 8),
      filename: "host-1.wav",
    });
    const host2 = await assignRealtimeSpeakerCluster({
      sessionId: session.id,
      itemId: "host-2",
      audioBytes: clip(dir, "host-2", 73.3, 5.9),
      filename: "host-2.wav",
    });
    const reporter = await assignRealtimeSpeakerCluster({
      sessionId: session.id,
      itemId: "reporter-1",
      audioBytes: clip(dir, "reporter-1", 121.9, 8),
      filename: "reporter-1.wav",
    });
    if (host1?.label !== "A" || host2?.label !== "A" || reporter?.label !== "B") {
      throw new Error(
        `화자 라벨 불일치: ${host1?.label}/${host2?.label}/${reporter?.label}`,
      );
    }
    const clusters = await prisma.realtimeSpeakerCluster.findMany({
      where: { sessionId: session.id },
    });
    if (clusters.length !== 2) throw new Error(`클러스터 수 불일치: ${clusters.length}`);
    if (
      clusters.some(
        (cluster) =>
          JSON.stringify(cluster.centroid).includes('"vector"') ||
          !JSON.stringify(cluster.centroid).includes('"sealed"'),
      )
    ) {
      throw new Error("개인 세션 centroid가 평문이거나 암호화 envelope이 없습니다.");
    }
    await prisma.realtimeSpeakerCluster.updateMany({
      where: { sessionId: session.id },
      data: { expiresAt: new Date(0) },
    });
    const purge = await purgeExpiredRealtimeSpeakerClusters();
    const remaining = await prisma.realtimeSpeakerCluster.count({
      where: { sessionId: session.id },
    });
    if (remaining !== 0) throw new Error("만료된 centroid가 삭제되지 않았습니다.");
    console.log(
      JSON.stringify({
        ok: true,
        labels: [host1.label, host2.label, reporter.label],
        similarities: [host2.similarity, reporter.similarity],
        purged: purge.deleted,
      }),
    );
  } finally {
    await prisma.realtimeSttSession.delete({ where: { id: session.id } });
    rmSync(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

void main();
