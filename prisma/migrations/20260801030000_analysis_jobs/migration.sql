-- CreateEnum
CREATE TYPE "AnalysisJobStatus" AS ENUM (
    'QUEUED',
    'RUNNING',
    'SUCCEEDED',
    'FAILED'
);

-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vault_file_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "analysis_mode" "AnalysisMode" NOT NULL DEFAULT 'STANDARD',
    "bypass_moderation" BOOLEAN NOT NULL DEFAULT false,
    "status" "AnalysisJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analysis_jobs_meeting_id_key"
ON "analysis_jobs"("meeting_id");

CREATE INDEX "analysis_jobs_status_available_at_created_at_idx"
ON "analysis_jobs"("status", "available_at", "created_at");

CREATE INDEX "analysis_jobs_status_locked_at_idx"
ON "analysis_jobs"("status", "locked_at");

CREATE INDEX "analysis_jobs_user_id_created_at_idx"
ON "analysis_jobs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "analysis_jobs"
ADD CONSTRAINT "analysis_jobs_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
