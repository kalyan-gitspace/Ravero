ALTER TABLE "bookings"
  ADD COLUMN "idempotencyKey" VARCHAR(64),
  ADD COLUMN "requestHash" CHAR(64);

CREATE UNIQUE INDEX "bookings_customerId_idempotencyKey_key"
  ON "bookings" ("customerId", "idempotencyKey");
