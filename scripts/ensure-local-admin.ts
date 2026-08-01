/**
 * 로컬 관리자 + 제품기획팀(대표=어드민) 보장.
 * 1) ADMIN_EMAILS + ADMIN_SEED_PASSWORD → ensureAdminUser
 * 2) 비프로덕션: 로컬 개발 관리자 + 팀 시드
 *
 *   npm run db:admin
 *   npx tsx scripts/ensure-local-admin.ts
 */
import { config } from "dotenv";

import {
  LOCAL_DEV_ADMIN_EMAIL,
  ensureAdminUser,
  ensureLocalDevAdmin,
} from "../src/lib/ensure-admin";
import { ensureLocalDevProductTeam } from "../src/lib/ensure-local-team";
import { prisma } from "../src/lib/prisma";

config({ path: ".env.local" });
config();

async function main() {
  const primary = await ensureAdminUser();
  if (primary.ok) {
    console.log(`[admin] 관리자 준비: ${primary.email} (${primary.role})`);
    if (process.env.NODE_ENV !== "production") {
      console.log(
        "[admin] 비밀번호는 ADMIN_SEED_PASSWORD(로컬 env)를 사용합니다.",
      );
    }
  } else {
    const fallback = await ensureLocalDevAdmin();
    if (!fallback.ok) {
      console.log(`[admin] 건너뜀: ${primary.message}`);
      if (process.env.NODE_ENV !== "production") {
        console.log(
          `[admin] 로컬 기본 계정: ${LOCAL_DEV_ADMIN_EMAIL} (비밀번호는 로컬 설정 참고)`,
        );
      }
      return;
    }
    console.log(
      `[admin] 로컬 관리자 준비: ${fallback.email} (${fallback.role})`,
    );
    console.log(`[admin] 로컬 개발 로그인 email: ${fallback.email}`);
    console.log("[admin] 비밀번호는 로그에 출력하지 않습니다.");
  }

  if (process.env.NODE_ENV === "production") return;

  const team = await ensureLocalDevProductTeam();
  if (!team.ok) {
    console.log(`[admin] 팀 시드 건너뜀: ${team.message}`);
    return;
  }

  console.log(
    `[admin] 팀 준비: ${team.teamName} (대표 ${team.ownerEmail}, 멤버 ${team.memberCount}명)`,
  );
  for (const row of team.seeded) {
    const label =
      row.teamRole === "OWNER"
        ? "팀 대표"
        : row.teamRole === "ADMIN"
          ? "팀장"
          : "팀원";
    console.log(`[admin]  ${label}: ${row.email}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
