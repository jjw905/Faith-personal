-- Team KMS provider and wrapped envelope data keys.
CREATE TYPE "TeamKmsProvider" AS ENUM ('AWS', 'GCP');

ALTER TABLE "team_security_keys"
ADD COLUMN "provider" "TeamKmsProvider",
ADD COLUMN "content_data_key_ciphertext" TEXT,
ADD COLUMN "audit_data_key_ciphertext" TEXT;

-- Team-owned vault objects retain the logical plaintext size in `size`.
ALTER TABLE "vault_files"
ADD COLUMN "team_id" TEXT,
ADD COLUMN "content_encryption" JSONB;

CREATE INDEX "vault_files_team_id_created_at_idx"
ON "vault_files"("team_id", "created_at");

ALTER TABLE "vault_files"
ADD CONSTRAINT "vault_files_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "teams"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
