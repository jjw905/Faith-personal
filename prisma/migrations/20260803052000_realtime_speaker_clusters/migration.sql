CREATE TABLE IF NOT EXISTS "realtime_speaker_clusters" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "display_name" TEXT,
    "centroid" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "sample_count" INTEGER NOT NULL DEFAULT 1,
    "total_audio_sec" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "realtime_speaker_clusters_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "realtime_stt_utterances"
  ADD COLUMN IF NOT EXISTS "speaker_label" TEXT,
  ADD COLUMN IF NOT EXISTS "speaker_cluster_id" TEXT;

ALTER TABLE "realtime_stt_sessions"
  ADD COLUMN IF NOT EXISTS "speaker_tracking_enabled" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "realtime_speaker_clusters_session_id_label_key"
  ON "realtime_speaker_clusters"("session_id", "label");
CREATE INDEX IF NOT EXISTS "realtime_speaker_clusters_expires_at_idx"
  ON "realtime_speaker_clusters"("expires_at");
CREATE INDEX IF NOT EXISTS "realtime_stt_utterances_speaker_cluster_id_idx"
  ON "realtime_stt_utterances"("speaker_cluster_id");

ALTER TABLE "realtime_speaker_clusters"
  ADD CONSTRAINT "realtime_speaker_clusters_session_id_fkey"
  FOREIGN KEY ("session_id") REFERENCES "realtime_stt_sessions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "realtime_stt_utterances"
  ADD CONSTRAINT "realtime_stt_utterances_speaker_cluster_id_fkey"
  FOREIGN KEY ("speaker_cluster_id") REFERENCES "realtime_speaker_clusters"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
