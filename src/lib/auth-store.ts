import { prisma } from "@/lib/prisma";

function normalize(email: string) {
  return email.trim().toLowerCase();
}

/** 이메일 회원가입용 — DB에 이미 있으면 taken */
export async function registerEmail(email: string) {
  const e = normalize(email);
  await prisma.user.upsert({
    where: { email: e },
    create: { email: e },
    update: {},
  });
}

export async function isEmailTaken(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: normalize(email) },
    select: { id: true },
  });
  return Boolean(user);
}
