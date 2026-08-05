-- CreateTable
CREATE TABLE "team_chat_messages" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "channel" VARCHAR(32) NOT NULL DEFAULT 'general',
    "author_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_type" VARCHAR(32),
    "vault_file_id" TEXT,
    "team_meeting_id" TEXT,
    "attachment_meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "team_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_chat_messages_team_id_channel_created_at_idx" ON "team_chat_messages"("team_id", "channel", "created_at");

-- CreateIndex
CREATE INDEX "team_chat_messages_author_id_created_at_idx" ON "team_chat_messages"("author_id", "created_at");

-- AddForeignKey
ALTER TABLE "team_chat_messages" ADD CONSTRAINT "team_chat_messages_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_chat_messages" ADD CONSTRAINT "team_chat_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
