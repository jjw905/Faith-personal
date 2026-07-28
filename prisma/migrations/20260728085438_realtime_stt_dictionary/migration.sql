-- CreateEnum
CREATE TYPE "RealtimeSttSessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "team_meetings" ADD COLUMN     "stt_run_id" TEXT;

-- CreateTable
CREATE TABLE "realtime_stt_sessions" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_meeting_id" TEXT,
    "title" TEXT NOT NULL,
    "status" "RealtimeSttSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "billed_audio_seconds" INTEGER NOT NULL DEFAULT 0,
    "estimated_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "realtime_stt_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "realtime_stt_utterances" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "start_sec" DOUBLE PRECISION NOT NULL,
    "end_sec" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "corrections" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "realtime_stt_utterances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "korean_dictionary_cache" (
    "word" TEXT NOT NULL,
    "exists" BOOLEAN NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "korean_dictionary_cache_pkey" PRIMARY KEY ("word")
);

-- CreateTable
CREATE TABLE "korean_dictionary_usage" (
    "day" TEXT NOT NULL,
    "call_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "korean_dictionary_usage_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE INDEX "realtime_stt_sessions_user_id_created_at_idx" ON "realtime_stt_sessions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "realtime_stt_sessions_meeting_id_idx" ON "realtime_stt_sessions"("meeting_id");

-- CreateIndex
CREATE INDEX "realtime_stt_sessions_run_id_status_idx" ON "realtime_stt_sessions"("run_id", "status");

-- CreateIndex
CREATE INDEX "realtime_stt_sessions_team_meeting_id_status_idx" ON "realtime_stt_sessions"("team_meeting_id", "status");

-- CreateIndex
CREATE INDEX "realtime_stt_utterances_session_id_sequence_idx" ON "realtime_stt_utterances"("session_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "realtime_stt_utterances_session_id_item_id_key" ON "realtime_stt_utterances"("session_id", "item_id");

-- CreateIndex
CREATE INDEX "korean_dictionary_cache_checked_at_idx" ON "korean_dictionary_cache"("checked_at");

-- AddForeignKey
ALTER TABLE "realtime_stt_sessions" ADD CONSTRAINT "realtime_stt_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "realtime_stt_sessions" ADD CONSTRAINT "realtime_stt_sessions_team_meeting_id_fkey" FOREIGN KEY ("team_meeting_id") REFERENCES "team_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "realtime_stt_utterances" ADD CONSTRAINT "realtime_stt_utterances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "realtime_stt_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
