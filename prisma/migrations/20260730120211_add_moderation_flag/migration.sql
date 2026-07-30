-- CreateTable
CREATE TABLE "moderation_flags" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "meeting_id" TEXT,
    "categories" TEXT[],
    "max_score" DOUBLE PRECISION NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "moderation_flags_user_id_created_at_idx" ON "moderation_flags"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "moderation_flags_blocked_created_at_idx" ON "moderation_flags"("blocked", "created_at");

-- AddForeignKey
ALTER TABLE "moderation_flags" ADD CONSTRAINT "moderation_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
