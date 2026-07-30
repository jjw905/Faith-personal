ALTER TABLE "realtime_stt_sessions"
ADD COLUMN "second_pass_seconds" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "realtime_stt_utterances"
ADD COLUMN "mean_logprob" DOUBLE PRECISION,
ADD COLUMN "second_pass" BOOLEAN NOT NULL DEFAULT false;
