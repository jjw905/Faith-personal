-- FK lookup / cascade efficiency
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts"("user_id");

CREATE INDEX IF NOT EXISTS "sessions_user_id_idx" ON "sessions"("user_id");

-- Auth.js adapter + OTP token uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS "verification_tokens_token_key" ON "verification_tokens"("token");

-- deleteMany by identifier
CREATE INDEX IF NOT EXISTS "verification_tokens_identifier_idx" ON "verification_tokens"("identifier");

-- expired token cleanup
CREATE INDEX IF NOT EXISTS "verification_tokens_expires_idx" ON "verification_tokens"("expires");

-- admin role filters
CREATE INDEX IF NOT EXISTS "users_role_disabled_idx" ON "users"("role", "disabled");
