ALTER TABLE "saved_addresses"
  ADD COLUMN "placeId" VARCHAR(256);

ALTER TABLE "booking_stops"
  ADD COLUMN "placeId" VARCHAR(256);
