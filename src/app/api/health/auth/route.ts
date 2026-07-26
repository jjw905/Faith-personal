import { NextResponse } from "next/server";

import { assertSetupSecret } from "@/lib/setup-auth";
import { spacesConfigured } from "@/lib/storage/spaces";

const REQUIRED_TABLES = [
  "users",
  "accounts",
  "sessions",
  "verification_tokens",
  "vault_files",
] as const;

/**
 * 공개: { ok } 만 (인프라 세부 힌트 없음).
 * 상세: Authorization: Bearer <SETUP_SECRET>
 */
export async function GET(request: Request) {
  const detailed = assertSetupSecret(request).ok;

  const required = {
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET?.trim()),
    AUTH_URL: Boolean(process.env.AUTH_URL?.trim()),
    DATABASE_URL: Boolean(process.env.DATABASE_URL?.trim()),
  };

  let databaseOk: boolean | null = null;
  let schemaOk: boolean | null = null;
  let databaseError: string | null = null;
  const tables: Record<(typeof REQUIRED_TABLES)[number], boolean> = {
    users: false,
    accounts: false,
    sessions: false,
    verification_tokens: false,
    vault_files: false,
  };

  if (required.DATABASE_URL) {
    try {
      const { prisma } = await import("@/lib/prisma");
      await prisma.$queryRaw`SELECT 1`;
      databaseOk = true;

      const rows = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename
        FROM pg_catalog.pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (
            'users',
            'accounts',
            'sessions',
            'verification_tokens',
            'vault_files'
          )
      `;
      const found = new Set(rows.map((r) => r.tablename));
      for (const name of REQUIRED_TABLES) {
        tables[name] = found.has(name);
      }
      schemaOk = REQUIRED_TABLES.every((name) => tables[name]);
      if (!schemaOk) {
        databaseError = "missing_tables";
      }
    } catch (err) {
      databaseOk = databaseOk ?? false;
      schemaOk = false;
      databaseError =
        err instanceof Error ? err.message.slice(0, 200) : "db_error";
    }
  }

  const missingRequired = Object.entries(required)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  const ok =
    missingRequired.length === 0 &&
    databaseOk !== false &&
    schemaOk !== false;

  if (!detailed) {
    return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
  }

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
    SETUP_SECRET: Boolean(process.env.SETUP_SECRET?.trim()),
    ADMIN_EMAILS: Boolean(process.env.ADMIN_EMAILS?.trim()),
    ADMIN_SEED_PASSWORD: Boolean(process.env.ADMIN_SEED_PASSWORD?.trim()),
    ALLOW_LOCAL_VAULT: process.env.ALLOW_LOCAL_VAULT === "1",
  };

  return NextResponse.json(
    {
      ok,
      missingRequired,
      required,
      optional,
      databaseOk,
      schemaOk,
      tables,
      spacesConfigured: spacesConfigured(),
      resendConfigured: Boolean(process.env.AUTH_RESEND_KEY?.trim()),
      adminEnvConfigured: Boolean(
        process.env.ADMIN_EMAILS?.trim() &&
          process.env.ADMIN_SEED_PASSWORD?.trim(),
      ),
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
