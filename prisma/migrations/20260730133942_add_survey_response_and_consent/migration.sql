-- AlterTable
ALTER TABLE "users" ADD COLUMN     "demand_survey_consent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "survey_responses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payment_intent" TEXT NOT NULL,
    "price_preference" TEXT,
    "stt_satisfaction" INTEGER NOT NULL,
    "feature_priorities" TEXT[],
    "improvement_note" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "survey_responses_user_id_key" ON "survey_responses"("user_id");

-- CreateIndex
CREATE INDEX "survey_responses_created_at_idx" ON "survey_responses"("created_at");

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
