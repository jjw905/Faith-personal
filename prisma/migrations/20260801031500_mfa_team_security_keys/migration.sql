-- MFA account fields
ALTER TABLE "users"
ADD COLUMN "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mfa_version" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "mfa_secret_encrypted" TEXT,
ADD COLUMN "mfa_pending_secret_encrypted" TEXT,
ADD COLUMN "mfa_pending_created_at" TIMESTAMP(3),
ADD COLUMN "mfa_last_used_step" INTEGER;

CREATE TABLE "mfa_recovery_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mfa_recovery_codes_code_hash_key"
ON "mfa_recovery_codes"("code_hash");

CREATE INDEX "mfa_recovery_codes_user_id_used_at_idx"
ON "mfa_recovery_codes"("user_id", "used_at");

ALTER TABLE "mfa_recovery_codes"
ADD CONSTRAINT "mfa_recovery_codes_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-team KMS key references
CREATE TYPE "TeamSecurityKeyStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'FAILED');

CREATE TABLE "team_security_keys" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "content_key_arn" TEXT,
    "audit_key_arn" TEXT,
    "status" "TeamSecurityKeyStatus" NOT NULL DEFAULT 'PROVISIONING',
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_security_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "team_security_keys_team_id_key"
ON "team_security_keys"("team_id");

ALTER TABLE "team_security_keys"
ADD CONSTRAINT "team_security_keys_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "teams"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
