ALTER TABLE "fare_estimates"
ADD COLUMN "distanceMeters" DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE "fare_estimates"
ADD COLUMN "estimatedDurationSeconds" INTEGER NOT NULL DEFAULT 0;

UPDATE "bookings"
SET "status" = 'REQUESTED'
WHERE "status" = 'PENDING';

UPDATE "booking_status_history"
SET "status" = 'REQUESTED'
WHERE "status" = 'PENDING';

ALTER TABLE "bookings"
ALTER COLUMN "status" SET DEFAULT 'REQUESTED';

ALTER TABLE "driver_profiles"
ADD COLUMN "isAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "currentLatitude" DECIMAL(9, 6),
ADD COLUMN "currentLongitude" DECIMAL(9, 6),
ADD COLUMN "locationUpdatedAt" TIMESTAMP(3);

CREATE INDEX "driver_profiles_isAvailable_locationUpdatedAt_idx"
ON "driver_profiles"("isAvailable", "locationUpdatedAt");
