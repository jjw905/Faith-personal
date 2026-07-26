-- CreateEnum
CREATE TYPE "TeamMeetingEndReason" AS ENUM ('COMPLETED', 'CANCELED', 'ORGANIZER_ABSENT');

-- AlterEnum
DO $$ BEGIN
  ALTER TYPE "TeamMeetingState" ADD VALUE 'CANCELED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable team_policies
ALTER TABLE "team_policies"
ADD COLUMN IF NOT EXISTS "announcement_hide_after_read" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "force_microphone_off" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "pre_host_recording_default" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "pre_host_recording_locked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "notification_policy" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "schedule_policy" JSONB NOT NULL DEFAULT '{}';

-- AlterTable team_meetings
ALTER TABLE "team_meetings"
ADD COLUMN IF NOT EXISTS "organizer_id" TEXT,
ADD COLUMN IF NOT EXISTS "backup_host_id" TEXT,
ADD COLUMN IF NOT EXISTS "current_host_id" TEXT,
ADD COLUMN IF NOT EXISTS "scheduled_start_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "duration_minutes" INTEGER,
ADD COLUMN IF NOT EXISTS "canceled_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "end_reason" "TeamMeetingEndReason",
ADD COLUMN IF NOT EXISTS "recording_active" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "stt_started_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "stt_accumulated_seconds" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "pre_host_recording_override" BOOLEAN,
ADD COLUMN IF NOT EXISTS "host_present_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "absence_warned_at" TIMESTAMP(3);

UPDATE "team_meetings"
SET "organizer_id" = "created_by_id"
WHERE "organizer_id" IS NULL;

ALTER TABLE "team_meetings"
ALTER COLUMN "organizer_id" SET NOT NULL;

-- AlterTable team_meeting_access
ALTER TABLE "team_meeting_access"
ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "joined_at" TIMESTAMP(3);

-- AlterTable notifications
ALTER TABLE "notifications"
ADD COLUMN IF NOT EXISTS "kind" TEXT,
ADD COLUMN IF NOT EXISTS "team_id" TEXT,
ADD COLUMN IF NOT EXISTS "meeting_id" TEXT,
ADD COLUMN IF NOT EXISTS "group_key" TEXT,
ADD COLUMN IF NOT EXISTS "visible_in_workspace" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "confirmed_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "dismissed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "team_announcements" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "team_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "team_announcement_reads" (
    "id" TEXT NOT NULL,
    "announcement_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_announcement_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_personal_settings" (
    "user_id" TEXT NOT NULL,
    "default_microphone_on" BOOLEAN NOT NULL DEFAULT false,
    "preferred_input_device_id" TEXT,
    "notification_sound_enabled" BOOLEAN NOT NULL DEFAULT true,
    "display_prefs" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_personal_settings_pkey" PRIMARY KEY ("user_id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "team_meetings_team_id_scheduled_start_at_idx" ON "team_meetings"("team_id", "scheduled_start_at");
CREATE INDEX IF NOT EXISTS "team_meetings_organizer_id_scheduled_start_at_idx" ON "team_meetings"("organizer_id", "scheduled_start_at");
CREATE INDEX IF NOT EXISTS "team_meeting_access_user_id_acknowledged_at_idx" ON "team_meeting_access"("user_id", "acknowledged_at");
CREATE INDEX IF NOT EXISTS "notifications_user_id_kind_confirmed_at_idx" ON "notifications"("user_id", "kind", "confirmed_at");
CREATE INDEX IF NOT EXISTS "notifications_user_id_meeting_id_kind_idx" ON "notifications"("user_id", "meeting_id", "kind");
CREATE INDEX IF NOT EXISTS "notifications_group_key_idx" ON "notifications"("group_key");
CREATE INDEX IF NOT EXISTS "team_announcements_team_id_created_at_idx" ON "team_announcements"("team_id", "created_at");
CREATE INDEX IF NOT EXISTS "team_announcements_team_id_pinned_created_at_idx" ON "team_announcements"("team_id", "pinned", "created_at");
CREATE INDEX IF NOT EXISTS "team_announcement_reads_user_id_read_at_idx" ON "team_announcement_reads"("user_id", "read_at");

CREATE UNIQUE INDEX IF NOT EXISTS "team_announcement_reads_announcement_id_user_id_key"
ON "team_announcement_reads"("announcement_id", "user_id");

-- ForeignKeys
DO $$ BEGIN
  ALTER TABLE "team_meetings" ADD CONSTRAINT "team_meetings_organizer_id_fkey"
    FOREIGN KEY ("organizer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "team_meetings" ADD CONSTRAINT "team_meetings_backup_host_id_fkey"
    FOREIGN KEY ("backup_host_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "team_meetings" ADD CONSTRAINT "team_meetings_current_host_id_fkey"
    FOREIGN KEY ("current_host_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "team_announcements" ADD CONSTRAINT "team_announcements_team_id_fkey"
    FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "team_announcements" ADD CONSTRAINT "team_announcements_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "team_announcement_reads" ADD CONSTRAINT "team_announcement_reads_announcement_id_fkey"
    FOREIGN KEY ("announcement_id") REFERENCES "team_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "team_announcement_reads" ADD CONSTRAINT "team_announcement_reads_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "user_personal_settings" ADD CONSTRAINT "user_personal_settings_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
