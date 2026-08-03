/**
 * 팀 파일 envelope v1 -> v2 운영 회전기. 기본은 읽기 전용 inventory다.
 * 실제 쓰기는 --execute를 명시해야 하며, 원본 객체는 성공 후에도 삭제하지 않는다.
 */
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

function arg(name: string): string | undefined {
  return process.argv
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const {
    getTeamEncryptionInventory,
    rotateTeamFileV1ToV2,
  } = await import("../src/lib/storage/vault-service");
  const inventory = await getTeamEncryptionInventory();
  const execute = process.argv.includes("--execute");
  const requestedId = arg("--file-id");
  const limitRaw = Number(arg("--limit") ?? 1);
  const limit = Number.isSafeInteger(limitRaw) && limitRaw > 0 ? limitRaw : 1;
  const candidates = inventory.files
    .filter((row) => row.version === 1)
    .filter((row) => !requestedId || row.id === requestedId)
    .slice(0, limit);
  console.log(
    JSON.stringify(
      {
        mode: execute ? "execute" : "inventory-only",
        inventory: {
          total: inventory.total,
          v1: inventory.v1,
          v2: inventory.v2,
          invalid: inventory.invalid,
          v1Bytes: inventory.v1Bytes,
        },
        selected: candidates.map((row) => ({
          id: row.id,
          teamId: row.teamId,
          name: row.name,
          size: row.size,
        })),
        originalDeletion: "disabled",
      },
      null,
      2,
    ),
  );
  if (!execute) {
    await prisma.$disconnect();
    return;
  }
  for (const candidate of candidates) {
    try {
      const result = await rotateTeamFileV1ToV2(candidate.id);
      console.log(JSON.stringify({ ok: true, ...result }));
    } catch (error) {
      console.error(
        JSON.stringify({
          ok: false,
          fileId: candidate.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
