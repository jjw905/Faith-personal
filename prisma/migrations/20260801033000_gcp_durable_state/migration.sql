CREATE TABLE "user_meeting_records" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "workspace" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "progress_percent" INTEGER,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_meeting_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_meeting_records_user_id_workspace_created_at_idx"
ON "user_meeting_records"("user_id", "workspace", "created_at");

CREATE INDEX "user_meeting_records_phase_updated_at_idx"
ON "user_meeting_records"("phase", "updated_at");

CREATE TABLE "ai_usage_events" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT,
    "stage" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "duration_sec" INTEGER,
    "chunk_count" INTEGER,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "total_tokens" INTEGER NOT NULL,
    "estimated_usd" DOUBLE PRECISION NOT NULL,
    "bill_source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_events_user_id_at_idx"
ON "ai_usage_events"("user_id", "at");

CREATE INDEX "ai_usage_events_meeting_id_at_idx"
ON "ai_usage_events"("meeting_id", "at");

CREATE INDEX "ai_usage_events_at_idx"
ON "ai_usage_events"("at");

CREATE TABLE "pipeline_attempts" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "analysis_mode" "AnalysisMode",
    "duration_sec" INTEGER,
    "charged_sec" INTEGER,
    "speaker_count" INTEGER,
    "outcome" TEXT NOT NULL,
    "failed_stage" TEXT,
    "topic_bucket" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pipeline_attempts_user_id_at_idx"
ON "pipeline_attempts"("user_id", "at");

CREATE INDEX "pipeline_attempts_meeting_id_at_idx"
ON "pipeline_attempts"("meeting_id", "at");

CREATE INDEX "pipeline_attempts_outcome_at_idx"
ON "pipeline_attempts"("outcome", "at");

ALTER TABLE "user_meeting_records"
ADD CONSTRAINT "user_meeting_records_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
