-- CreateEnum
CREATE TYPE "PersonalRealtimeMeetingState" AS ENUM (
  'LOBBY',
  'ACTIVE',
  'ENDED',
  'PROCESSING',
  'READY',
  'FAILED',
  'CANCELED'
);

-- CreateEnum
CREATE TYPE "PersonalRealtimeInviteStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'REMOVED'
);

-- AlterTable
ALTER TABLE "realtime_stt_sessions"
ADD COLUMN "personal_meeting_id" TEXT;

-- CreateTable
CREATE TABLE "personal_realtime_meetings" (
  "id" TEXT NOT NULL,
  "legacy_meeting_id" TEXT,
  "title" TEXT NOT NULL,
  "room_name" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "owner_id" TEXT NOT NULL,
  "max_participants" INTEGER NOT NULL DEFAULT 4,
  "state" "PersonalRealtimeMeetingState" NOT NULL DEFAULT 'LOBBY',
  "recording_active" BOOLEAN NOT NULL DEFAULT false,
  "started_at" TIMESTAMP(3),
  "ended_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "personal_realtime_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_realtime_access" (
  "id" TEXT NOT NULL,
  "meeting_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "status" "PersonalRealtimeInviteStatus" NOT NULL DEFAULT 'PENDING',
  "responded_at" TIMESTAMP(3),
  "joined_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "personal_realtime_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_realtime_meetings_legacy_meeting_id_key"
ON "personal_realtime_meetings"("legacy_meeting_id");

CREATE UNIQUE INDEX "personal_realtime_meetings_room_name_key"
ON "personal_realtime_meetings"("room_name");

CREATE UNIQUE INDEX "personal_realtime_meetings_run_id_key"
ON "personal_realtime_meetings"("run_id");

CREATE INDEX "personal_realtime_meetings_owner_id_created_at_idx"
ON "personal_realtime_meetings"("owner_id", "created_at");

CREATE INDEX "personal_realtime_meetings_state_created_at_idx"
ON "personal_realtime_meetings"("state", "created_at");

CREATE UNIQUE INDEX "personal_realtime_access_meeting_id_user_id_key"
ON "personal_realtime_access"("meeting_id", "user_id");

CREATE INDEX "personal_realtime_access_user_id_status_created_at_idx"
ON "personal_realtime_access"("user_id", "status", "created_at");

CREATE INDEX "realtime_stt_sessions_personal_meeting_id_status_idx"
ON "realtime_stt_sessions"("personal_meeting_id", "status");

-- AddForeignKey
ALTER TABLE "realtime_stt_sessions"
ADD CONSTRAINT "realtime_stt_sessions_personal_meeting_id_fkey"
FOREIGN KEY ("personal_meeting_id")
REFERENCES "personal_realtime_meetings"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personal_realtime_meetings"
ADD CONSTRAINT "personal_realtime_meetings_owner_id_fkey"
FOREIGN KEY ("owner_id")
REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personal_realtime_access"
ADD CONSTRAINT "personal_realtime_access_meeting_id_fkey"
FOREIGN KEY ("meeting_id")
REFERENCES "personal_realtime_meetings"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "personal_realtime_access"
ADD CONSTRAINT "personal_realtime_access_user_id_fkey"
FOREIGN KEY ("user_id")
REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
