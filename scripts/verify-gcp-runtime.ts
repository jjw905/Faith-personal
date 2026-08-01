import { config } from "dotenv";
import { Prisma } from "@prisma/client";

config({ path: ".env.local" });
config();

const required: string[] = [
  "GCP_PROJECT_ID",
  "GCS_BUCKET",
  "AUTH_URL",
  "DATABASE_URL",
  "AUTH_SECRET",
  "SETUP_SECRET",
  "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY",
  "NEXT_SERVER_ACTION_ALLOWED_ORIGINS",
  "NEXT_PUBLIC_RECAPTCHA_SITE_KEY",
  "ADMIN_EMAILS",
  "MAINTENANCE_CRON_AUDIENCE",
  "MAINTENANCE_CRON_SERVICE_ACCOUNT",
  "OPENAI_API_KEY",
  "AUTH_RESEND_KEY",
  "RECAPTCHA_SECRET_KEY",
  "NOTIFICATION_ENC_KEY",
];

if (process.env.LIVEKIT_ENABLED === "1") {
  required.push("LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET");
}

const durableTables = [
  "vault_files",
  "analysis_jobs",
  "user_meeting_records",
  "ai_usage_events",
  "pipeline_attempts",
  "mfa_recovery_codes",
  "team_security_keys",
] as const;

async function verifyGcsAccess() {
  const projectId = process.env.GCP_PROJECT_ID?.trim();
  const bucketName = process.env.GCS_BUCKET?.trim();
  if (!projectId || !bucketName) return;
  const { Storage } = await import("@google-cloud/storage");
  const bucket = new Storage({ projectId }).bucket(bucketName);
  await bucket.getFiles({ prefix: "users/", maxResults: 1 });
  const probe = bucket.file("users/__faith_runtime_probe__");
  await probe.exists();
  await probe.getSignedUrl({
    version: "v4",
    action: "read",
    expires: Date.now() + 60_000,
  });
}

async function main() {
  const [{ prisma }, { evaluateKmsRuntime }] = await Promise.all([
    import("../src/lib/prisma"),
    import("../src/lib/kms-runtime-policy"),
  ]);

  try {
    const missing: string[] = required.filter(
      (name) => !process.env[name]?.trim(),
    );
    if (process.env.DURABLE_STATE_BACKEND !== "database") {
      missing.push("DURABLE_STATE_BACKEND=database");
    }
    if (process.env.STORAGE_BACKEND !== "gcs") {
      missing.push("STORAGE_BACKEND=gcs");
    }
    if (missing.length > 0) {
      throw new Error(
        `GCP runtime configuration is incomplete: ${missing.join(", ")}`,
      );
    }

    await verifyGcsAccess();
    await prisma.$queryRaw`SELECT 1`;
    const rows = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (${Prisma.join(durableTables)})
    `;
    const present = new Set(rows.map((row) => row.table_name));
    const missingTables = durableTables.filter((table) => !present.has(table));
    if (missingTables.length > 0) {
      throw new Error(
        `Durable state migration is incomplete: ${missingTables.join(", ")}`,
      );
    }

    const kms = evaluateKmsRuntime();
    if (process.env.GCP_KMS_ENABLED === "1" && !kms.allowed) {
      throw new Error(
        `GCP KMS configuration is incomplete: ${kms.reason}${
          kms.reason === "missing_configuration"
            ? ` (${kms.missing?.join(", ")})`
            : ""
        }`,
      );
    }

    console.log(
      `[gcp-runtime] project=${process.env.GCP_PROJECT_ID} bucket=${process.env.GCS_BUCKET} durable-state=database kms=${kms.allowed ? "ready" : "disabled"}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
