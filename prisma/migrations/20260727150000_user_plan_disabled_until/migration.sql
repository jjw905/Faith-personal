-- AlterTable
ALTER TABLE "users" ADD COLUMN "plan_until" TIMESTAMP(3),
ADD COLUMN "disabled_until" TIMESTAMP(3);
