CREATE TYPE "AnalysisMode" AS ENUM ('STANDARD', 'PRECISION');

CREATE TYPE "AnalysisUsageStatus" AS ENUM ('RESERVED', 'CHARGED', 'RELEASED');

CREATE TABLE "analysis_usage" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "mode" "AnalysisMode" NOT NULL,
    "duration_sec" INTEGER NOT NULL,
    "charged_sec" INTEGER NOT NULL,
    "monthly_sec" INTEGER NOT NULL DEFAULT 0,
    "credit_sec" INTEGER NOT NULL DEFAULT 0,
    "grace_sec" INTEGER NOT NULL DEFAULT 0,
    "status" "AnalysisUsageStatus" NOT NULL DEFAULT 'RESERVED',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "finalized_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_usage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "minute_credit_ledger" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "delta_sec" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "minute_credit_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analysis_usage_meeting_id_key"
ON "analysis_usage"("meeting_id");

CREATE INDEX "analysis_usage_user_id_period_key_status_idx"
ON "analysis_usage"("user_id", "period_key", "status");

CREATE INDEX "analysis_usage_status_expires_at_idx"
ON "analysis_usage"("status", "expires_at");

CREATE UNIQUE INDEX "minute_credit_ledger_reference_key"
ON "minute_credit_ledger"("reference");

CREATE INDEX "minute_credit_ledger_user_id_created_at_idx"
ON "minute_credit_ledger"("user_id", "created_at");

ALTER TABLE "analysis_usage"
ADD CONSTRAINT "analysis_usage_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "minute_credit_ledger"
ADD CONSTRAINT "minute_credit_ledger_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
