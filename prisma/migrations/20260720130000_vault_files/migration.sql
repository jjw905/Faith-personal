-- CreateEnum
CREATE TYPE "VaultPurpose" AS ENUM ('VAULT', 'MEETING');

-- CreateTable
CREATE TABLE "vault_files" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "purpose" "VaultPurpose" NOT NULL DEFAULT 'VAULT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vault_files_key_key" ON "vault_files"("key");

-- CreateIndex
CREATE INDEX "vault_files_user_id_created_at_idx" ON "vault_files"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "vault_files" ADD CONSTRAINT "vault_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
