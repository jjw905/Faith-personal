-- Cooperative cancellation for queued/running meeting analysis.
ALTER TYPE "AnalysisJobStatus" ADD VALUE IF NOT EXISTS 'CANCELED';

ALTER TABLE "analysis_jobs"
ADD COLUMN IF NOT EXISTS "cancel_requested_at" TIMESTAMP(3);
