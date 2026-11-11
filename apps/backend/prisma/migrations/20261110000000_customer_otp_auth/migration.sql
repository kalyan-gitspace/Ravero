ALTER TABLE "users"
  ADD CONSTRAINT "users_phone_e164_check"
  CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$');

ALTER TABLE "customer_profiles"
  ADD COLUMN "profileImageUrl" VARCHAR(512);

ALTER TABLE "user_sessions"
  RENAME COLUMN "refreshToken" TO "refreshTokenHash";

UPDATE "user_sessions"
SET "refreshTokenHash" = encode(digest(convert_to("refreshTokenHash", 'UTF8'), 'sha256'), 'hex');

ALTER TABLE "user_sessions"
  ALTER COLUMN "refreshTokenHash" TYPE VARCHAR(64),
  ADD COLUMN "revokedAt" TIMESTAMPTZ;

CREATE UNIQUE INDEX "user_sessions_refreshTokenHash_key"
  ON "user_sessions" ("refreshTokenHash");

CREATE INDEX "user_sessions_userId_expiresAt_idx"
  ON "user_sessions" ("userId", "expiresAt");

CREATE TABLE "otp_challenges" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "phone" VARCHAR(16) NOT NULL,
  "codeHash" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "consumedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "otp_challenges_phone_e164_check"
    CHECK ("phone" ~ '^\+[1-9][0-9]{7,14}$'),
  CONSTRAINT "otp_challenges_attempts_check"
    CHECK ("attempts" >= 0 AND "maxAttempts" > 0 AND "attempts" <= "maxAttempts")
);

CREATE INDEX "otp_challenges_phone_createdAt_idx"
  ON "otp_challenges" ("phone", "createdAt");

CREATE INDEX "otp_challenges_expiresAt_idx"
  ON "otp_challenges" ("expiresAt");
