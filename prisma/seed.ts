import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)[0];
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!email || !password) {
    console.warn(
      "[seed] ADMIN_EMAILS 또는 ADMIN_SEED_PASSWORD가 없어 슈퍼계정 시드를 건너뜁니다.",
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Admin",
      role: Role.ADMIN,
      emailVerified: new Date(),
      passwordHash,
    },
    update: {
      role: Role.ADMIN,
      emailVerified: new Date(),
      passwordHash,
      disabled: false,
    },
  });

  console.log(`[seed] ADMIN ready: ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
