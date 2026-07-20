import { NextResponse } from "next/server";

/**
 * 배포 진단용. 비밀값은 노출하지 않고 존재 여부만 반환.
 */
export async function GET() {
  const required = {
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET?.trim()),
    AUTH_URL: Boolean(process.env.AUTH_URL?.trim()),
    DATABASE_URL: Boolean(process.env.DATABASE_URL?.trim()),
  };
  const optional = {
    AUTH_RESEND_KEY: Boolean(process.env.AUTH_RESEND_KEY?.trim()),
    AUTH_EMAIL_FROM: Boolean(process.env.AUTH_EMAIL_FROM?.trim()),
    AUTH_GOOGLE_ID: Boolean(process.env.AUTH_GOOGLE_ID?.trim()),
    AUTH_GOOGLE_SECRET: Boolean(process.env.AUTH_GOOGLE_SECRET?.trim()),
    AUTH_NAVER_ID: Boolean(process.env.AUTH_NAVER_ID?.trim()),
    AUTH_NAVER_SECRET: Boolean(process.env.AUTH_NAVER_SECRET?.trim()),
    AUTH_TWITTER_ID: Boolean(process.env.AUTH_TWITTER_ID?.trim()),
    AUTH_TWITTER_SECRET: Boolean(process.env.AUTH_TWITTER_SECRET?.trim()),
    DO_SPACES_BUCKET: Boolean(process.env.DO_SPACES_BUCKET?.trim()),
  };

  const missingRequired = Object.entries(required)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  let databaseOk: boolean | null = null;
  let schemaOk: boolean | null = null;
  let databaseError: string | null = null;
  if (required.DATABASE_URL) {
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.$queryRaw`SELECT 1`;
      databaseOk = true;
      try {
        await prisma.user.count();
        schemaOk = true;
      } catch (err) {
        schemaOk = false;
        databaseError =
          err instanceof Error ? err.message.slice(0, 200) : "schema_error";
      }
    } catch (err) {
      databaseOk = false;
      schemaOk = false;
      databaseError =
        err instanceof Error ? err.message.slice(0, 200) : "db_error";
    }
  }

  const ok =
    missingRequired.length === 0 &&
    databaseOk !== false &&
    schemaOk !== false;

  return NextResponse.json(
    {
      ok,
      missingRequired,
      required,
      optional,
      databaseOk,
      schemaOk,
      databaseError,
      authUrlHost: (() => {
        try {
          return process.env.AUTH_URL
            ? new URL(process.env.AUTH_URL).host
            : null;
        } catch {
          return "invalid_AUTH_URL";
        }
      })(),
    },
    { status: ok ? 200 : 503 },
  );
}
