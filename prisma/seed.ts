import { config } from "dotenv";

import {
  LOCAL_DEV_ADMIN_EMAIL,
  ensureAdminUser,
  ensureLocalDevAdmin,
} from "../src/lib/ensure-admin";
import { prisma } from "../src/lib/prisma";

config({ path: ".env.local" });
config();

async function main() {
  const primary = await ensureAdminUser();
  if (primary.ok) {
    console.log(`[seed] ADMIN ready: ${primary.email}`);
    return;
  }

  const fallback = await ensureLocalDevAdmin();
  if (fallback.ok) {
    console.log(`[seed] 로컬 ADMIN ready: ${fallback.email}`);
    console.log("[seed] 비밀번호는 로그에 출력하지 않습니다.");
    return;
  }

  console.warn(`[seed] ${primary.message}`);
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[seed] 로컬 기본 계정: ${LOCAL_DEV_ADMIN_EMAIL} (비밀번호는 로컬 설정 참고, npm run db:admin)`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
