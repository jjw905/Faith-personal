-- AlterTable
ALTER TABLE "realtime_stt_utterances" ADD COLUMN IF NOT EXISTS "words" JSONB;
