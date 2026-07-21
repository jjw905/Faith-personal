-- AlterTable
ALTER TABLE "users" ADD COLUMN "signup_provider" TEXT;

-- 이메일 가입(비밀번호 있음)은 credentials
UPDATE "users"
SET "signup_provider" = 'credentials'
WHERE "password_hash" IS NOT NULL
  AND "signup_provider" IS NULL;

-- 소셜만 있는 계정은 가장 오래된 Account(provider)를 최초 가입으로 간주
UPDATE "users" AS u
SET "signup_provider" = a."provider"
FROM (
  SELECT DISTINCT ON ("user_id") "user_id", "provider"
  FROM "accounts"
  WHERE "provider" IN ('google', 'naver', 'twitter')
  ORDER BY "user_id", "id" ASC
) AS a
WHERE u."id" = a."user_id"
  AND u."signup_provider" IS NULL;
