-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "TeamInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TeamMeetingMode" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "TeamMeetingState" AS ENUM ('SCHEDULED', 'ACTIVE', 'ENDED', 'PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "handle" TEXT,
ADD COLUMN     "invite_code" TEXT,
ADD COLUMN     "notification_retention_days" INTEGER NOT NULL DEFAULT 90;

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "seat_limit" INTEGER NOT NULL DEFAULT 2,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "can_invite" BOOLEAN NOT NULL DEFAULT false,
    "can_create_meeting" BOOLEAN NOT NULL DEFAULT false,
    "can_manage_record_access" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_policies" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "retention_days" INTEGER NOT NULL DEFAULT 90,
    "allow_admin_unmask" BOOLEAN NOT NULL DEFAULT true,
    "allow_external_sharing" BOOLEAN NOT NULL DEFAULT false,
    "participation_policy" JSONB NOT NULL DEFAULT '{}',
    "record_policy" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invites" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "invited_user_id" TEXT NOT NULL,
    "invited_by_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "status" "TeamInviteStatus" NOT NULL DEFAULT 'PENDING',
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "can_invite" BOOLEAN NOT NULL DEFAULT false,
    "can_create_meeting" BOOLEAN NOT NULL DEFAULT false,
    "can_manage_record_access" BOOLEAN NOT NULL DEFAULT false,
    "decline_reason" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_entitlements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "remaining_team_slots" INTEGER NOT NULL DEFAULT 0,
    "seat_limit" INTEGER NOT NULL DEFAULT 0,
    "granted_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_entitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_meetings" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "legacy_meeting_id" TEXT,
    "title" TEXT NOT NULL,
    "mode" "TeamMeetingMode" NOT NULL,
    "state" "TeamMeetingState" NOT NULL DEFAULT 'SCHEDULED',
    "livekit_room_name" TEXT,
    "created_by_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_meeting_access" (
    "id" TEXT NOT NULL,
    "meeting_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_participant" BOOLEAN NOT NULL DEFAULT false,
    "can_read_masked" BOOLEAN NOT NULL DEFAULT false,
    "granted_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_meeting_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_audit_logs" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "target_user_id" TEXT,
    "meeting_id" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");

-- CreateIndex
CREATE INDEX "teams_owner_id_idx" ON "teams"("owner_id");

-- CreateIndex
CREATE INDEX "team_members_user_id_idx" ON "team_members"("user_id");

-- CreateIndex
CREATE INDEX "team_members_team_id_role_idx" ON "team_members"("team_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_team_id_user_id_key" ON "team_members"("team_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_policies_team_id_key" ON "team_policies"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_invites_token_hash_key" ON "team_invites"("token_hash");

-- CreateIndex
CREATE INDEX "team_invites_invited_user_id_status_expires_at_idx" ON "team_invites"("invited_user_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "team_invites_team_id_status_idx" ON "team_invites"("team_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "team_entitlements_user_id_key" ON "team_entitlements"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_meetings_legacy_meeting_id_key" ON "team_meetings"("legacy_meeting_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_meetings_livekit_room_name_key" ON "team_meetings"("livekit_room_name");

-- CreateIndex
CREATE INDEX "team_meetings_team_id_created_at_idx" ON "team_meetings"("team_id", "created_at");

-- CreateIndex
CREATE INDEX "team_meetings_created_by_id_idx" ON "team_meetings"("created_by_id");

-- CreateIndex
CREATE INDEX "team_meeting_access_user_id_can_read_masked_idx" ON "team_meeting_access"("user_id", "can_read_masked");

-- CreateIndex
CREATE UNIQUE INDEX "team_meeting_access_meeting_id_user_id_key" ON "team_meeting_access"("meeting_id", "user_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "team_audit_logs_team_id_created_at_idx" ON "team_audit_logs"("team_id", "created_at");

-- CreateIndex
CREATE INDEX "team_audit_logs_actor_id_created_at_idx" ON "team_audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_handle_key" ON "users"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "users_invite_code_key" ON "users"("invite_code");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_policies" ADD CONSTRAINT "team_policies_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_invited_user_id_fkey" FOREIGN KEY ("invited_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_entitlements" ADD CONSTRAINT "team_entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_entitlements" ADD CONSTRAINT "team_entitlements_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_meetings" ADD CONSTRAINT "team_meetings_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_meetings" ADD CONSTRAINT "team_meetings_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_meeting_access" ADD CONSTRAINT "team_meeting_access_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "team_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_meeting_access" ADD CONSTRAINT "team_meeting_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_audit_logs" ADD CONSTRAINT "team_audit_logs_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_audit_logs" ADD CONSTRAINT "team_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_audit_logs" ADD CONSTRAINT "team_audit_logs_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
