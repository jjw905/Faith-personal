import { config } from "dotenv";

import {
  LOCAL_DEV_ADMIN_EMAIL,
  LOCAL_DEV_ADMIN_PASSWORD,
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
    console.log(`[seed] 로컬 개발 로그인: ${fallback.email} / ${fallback.password}`);
    return;
  }

  console.warn(`[seed] ${primary.message}`);
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[seed] 로컬 기본값: ${LOCAL_DEV_ADMIN_EMAIL} / ${LOCAL_DEV_ADMIN_PASSWORD} (npm run db:admin)`,
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
