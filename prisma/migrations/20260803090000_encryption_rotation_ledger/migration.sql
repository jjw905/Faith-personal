CREATE TABLE "encryption_rotations" (
    "id" TEXT NOT NULL,
    "vault_file_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "original_key" TEXT NOT NULL,
    "target_key" TEXT NOT NULL,
    "source_version" INTEGER NOT NULL DEFAULT 1,
    "target_version" INTEGER NOT NULL DEFAULT 2,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "original_size" INTEGER NOT NULL,
    "target_size" INTEGER,
    "plaintext_sha256" VARCHAR(64),
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "swapped_at" TIMESTAMP(3),
    "original_deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "encryption_rotations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "encryption_rotations_vault_file_id_key"
ON "encryption_rotations"("vault_file_id");

CREATE INDEX "encryption_rotations_status_updated_at_idx"
ON "encryption_rotations"("status", "updated_at");

CREATE INDEX "encryption_rotations_team_id_created_at_idx"
ON "encryption_rotations"("team_id", "created_at");
