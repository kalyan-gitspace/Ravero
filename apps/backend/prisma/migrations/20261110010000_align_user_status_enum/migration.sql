CREATE TYPE "UserStatus" AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'PENDING_VERIFICATION'
);

ALTER TABLE "users"
  DROP CONSTRAINT "users_status_check",
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "users"
  ALTER COLUMN "status" TYPE "UserStatus"
  USING "status"::"UserStatus";

ALTER TABLE "users"
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
