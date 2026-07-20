import { config } from "dotenv";

import { ensureAdminUser } from "../src/lib/ensure-admin";
import { prisma } from "../src/lib/prisma";

config({ path: ".env.local" });
config();

async function main() {
  const result = await ensureAdminUser();
  if (!result.ok) {
    console.warn(`[seed] ${result.message}`);
    return;
  }
  console.log(`[seed] ADMIN ready: ${result.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
