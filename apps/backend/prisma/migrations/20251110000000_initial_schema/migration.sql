CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "roles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(64) NOT NULL UNIQUE,
  "description" VARCHAR(255),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "permissions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(128) NOT NULL UNIQUE,
  "description" VARCHAR(255),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "role_permissions" (
  "roleId" UUID NOT NULL,
  "permissionId" UUID NOT NULL,
  PRIMARY KEY ("roleId", "permissionId"),
  CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE,
  CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE
);

CREATE TABLE "users" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" VARCHAR(255),
  "phone" VARCHAR(20),
  "passwordHash" VARCHAR(255),
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "isEmailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "isPhoneVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "users_email_key" UNIQUE ("email"),
  CONSTRAINT "users_phone_key" UNIQUE ("phone"),
  CONSTRAINT "users_status_check" CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION'))
);

CREATE TABLE "user_role_assignments" (
  "userId" UUID NOT NULL,
  "roleId" UUID NOT NULL,
  PRIMARY KEY ("userId", "roleId"),
  CONSTRAINT "user_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "user_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE
);

CREATE TABLE "user_sessions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "refreshToken" VARCHAR(255) NOT NULL,
  "deviceName" VARCHAR(128),
  "ipAddress" VARCHAR(64),
  "userAgent" VARCHAR(255),
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "lastUsedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "customer_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL UNIQUE,
  "firstName" VARCHAR(100),
  "lastName" VARCHAR(100),
  "dateOfBirth" TIMESTAMPTZ,
  "gender" VARCHAR(32),
  "emergencyName" VARCHAR(100),
  "emergencyPhone" VARCHAR(20),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "customer_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "driver_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL UNIQUE,
  "firstName" VARCHAR(100),
  "lastName" VARCHAR(100),
  "dateOfBirth" TIMESTAMPTZ,
  "driverLicenseNumber" VARCHAR(64),
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "preferredAreas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rating" DECIMAL(3,2),
  "totalTrips" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "driver_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "admin_profiles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL UNIQUE,
  "firstName" VARCHAR(100),
  "lastName" VARCHAR(100),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "admin_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "saved_addresses" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "label" VARCHAR(80) NOT NULL,
  "addressLine" VARCHAR(255) NOT NULL,
  "city" VARCHAR(80) NOT NULL,
  "state" VARCHAR(80) NOT NULL,
  "postalCode" VARCHAR(20),
  "country" VARCHAR(80) NOT NULL DEFAULT 'India',
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "saved_addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "vehicle_categories" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(64) NOT NULL UNIQUE,
  "slug" VARCHAR(64) NOT NULL UNIQUE,
  "description" VARCHAR(255),
  "baseFare" DECIMAL(10,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "service_types" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "vehicleCategoryId" UUID,
  "name" VARCHAR(64) NOT NULL,
  "code" VARCHAR(32) NOT NULL UNIQUE,
  "description" VARCHAR(255),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "service_types_vehicleCategoryId_fkey" FOREIGN KEY ("vehicleCategoryId") REFERENCES "vehicle_categories"("id")
);

CREATE TABLE "vehicles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "driverProfileId" UUID NOT NULL,
  "vehicleCategoryId" UUID NOT NULL,
  "make" VARCHAR(80) NOT NULL,
  "model" VARCHAR(80) NOT NULL,
  "year" INTEGER NOT NULL,
  "color" VARCHAR(64) NOT NULL,
  "plateNumber" VARCHAR(32) NOT NULL UNIQUE,
  "registrationNumber" VARCHAR(64) NOT NULL UNIQUE,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "vehicles_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "vehicles_vehicleCategoryId_fkey" FOREIGN KEY ("vehicleCategoryId") REFERENCES "vehicle_categories"("id")
);

CREATE TABLE "driver_documents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "driverProfileId" UUID NOT NULL,
  "documentType" VARCHAR(64) NOT NULL,
  "documentNumber" VARCHAR(128),
  "issueDate" TIMESTAMPTZ,
  "expiryDate" TIMESTAMPTZ,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "fileUrl" VARCHAR(512),
  "notes" VARCHAR(500),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "driver_documents_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE
);

CREATE TABLE "vehicle_documents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "vehicleId" UUID NOT NULL,
  "documentType" VARCHAR(64) NOT NULL,
  "documentNumber" VARCHAR(128),
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "fileUrl" VARCHAR(512),
  "expiryDate" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "vehicle_documents_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE CASCADE
);

CREATE TABLE "service_areas" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(128) NOT NULL,
  "state" VARCHAR(80) NOT NULL,
  "city" VARCHAR(80) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "description" VARCHAR(255),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "bookings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customerId" UUID NOT NULL,
  "driverId" UUID,
  "serviceTypeId" UUID NOT NULL,
  "pickupAddressId" UUID NOT NULL,
  "dropoffAddressId" UUID,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "scheduledAt" TIMESTAMPTZ,
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "bookings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "bookings_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id"),
  CONSTRAINT "bookings_serviceTypeId_fkey" FOREIGN KEY ("serviceTypeId") REFERENCES "service_types"("id"),
  CONSTRAINT "bookings_pickupAddressId_fkey" FOREIGN KEY ("pickupAddressId") REFERENCES "saved_addresses"("id"),
  CONSTRAINT "bookings_dropoffAddressId_fkey" FOREIGN KEY ("dropoffAddressId") REFERENCES "saved_addresses"("id")
);

CREATE TABLE "booking_stops" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "address" VARCHAR(255) NOT NULL,
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "booking_stops_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE
);

CREATE TABLE "booking_status_history" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "note" VARCHAR(500),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "booking_status_history_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE
);

CREATE TABLE "booking_assignments" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "driverId" UUID NOT NULL,
  "assignedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "acceptedAt" TIMESTAMPTZ,
  "rejectedAt" TIMESTAMPTZ,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ASSIGNED',
  "notes" VARCHAR(500),
  CONSTRAINT "booking_assignments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE
);

CREATE TABLE "fare_estimates" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL UNIQUE,
  "baseFare" DECIMAL(10,2) NOT NULL,
  "distanceFare" DECIMAL(10,2) NOT NULL,
  "timeFare" DECIMAL(10,2) NOT NULL,
  "surge" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "taxes" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(10,2) NOT NULL,
  "currency" VARCHAR(8) NOT NULL DEFAULT 'INR',
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fare_estimates_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE
);

CREATE TABLE "fare_breakdowns" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "fareEstimateId" UUID NOT NULL,
  "label" VARCHAR(128) NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "type" VARCHAR(32) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "fare_breakdowns_fareEstimateId_fkey" FOREIGN KEY ("fareEstimateId") REFERENCES "fare_estimates"("id") ON DELETE CASCADE
);

CREATE TABLE "payment_records" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "driverId" UUID,
  "paymentMode" VARCHAR(32) NOT NULL DEFAULT 'CASH',
  "amount" DECIMAL(10,2) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "reference" VARCHAR(128),
  "capturedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "payment_records_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE,
  CONSTRAINT "payment_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "platform_commissions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "rate" DECIMAL(5,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "platform_commissions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE
);

CREATE TABLE "titanium_accounts" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "lifetimePoints" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "tier" VARCHAR(32) NOT NULL DEFAULT 'STANDARD',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "titanium_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "titanium_transactions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "titaniumAccountId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" VARCHAR(32) NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "description" VARCHAR(255),
  "balanceAfter" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "titanium_transactions_titaniumAccountId_fkey" FOREIGN KEY ("titaniumAccountId") REFERENCES "titanium_accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "titanium_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "reward_rules" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "code" VARCHAR(64) NOT NULL UNIQUE,
  "rewardType" VARCHAR(32) NOT NULL,
  "title" VARCHAR(128) NOT NULL,
  "description" VARCHAR(500),
  "amount" DECIMAL(10,2) NOT NULL,
  "minBookingValue" DECIMAL(10,2),
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "validFrom" TIMESTAMPTZ,
  "validTo" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "trip_bundles" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(128) NOT NULL,
  "description" VARCHAR(500),
  "price" DECIMAL(10,2) NOT NULL,
  "credits" INTEGER NOT NULL DEFAULT 0,
  "bonusCredits" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "trip_bundle_items" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tripBundleId" UUID NOT NULL,
  "title" VARCHAR(128) NOT NULL,
  "description" VARCHAR(255),
  "value" DECIMAL(10,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "trip_bundle_items_tripBundleId_fkey" FOREIGN KEY ("tripBundleId") REFERENCES "trip_bundles"("id") ON DELETE CASCADE
);

CREATE TABLE "trip_bundle_credits" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "tripBundleId" UUID NOT NULL,
  "creditsUsed" INTEGER NOT NULL DEFAULT 0,
  "creditsRemaining" INTEGER NOT NULL DEFAULT 0,
  "purchasedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "trip_bundle_credits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "trip_bundle_credits_tripBundleId_fkey" FOREIGN KEY ("tripBundleId") REFERENCES "trip_bundles"("id") ON DELETE CASCADE
);

CREATE TABLE "restaurant_partners" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(128) NOT NULL,
  "cuisineType" VARCHAR(64),
  "description" VARCHAR(255),
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "restaurant_rewards" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "restaurantPartnerId" UUID NOT NULL,
  "title" VARCHAR(128) NOT NULL,
  "description" VARCHAR(500),
  "pointsCost" INTEGER NOT NULL DEFAULT 0,
  "validFrom" TIMESTAMPTZ,
  "validTo" TIMESTAMPTZ,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "restaurant_rewards_restaurantPartnerId_fkey" FOREIGN KEY ("restaurantPartnerId") REFERENCES "restaurant_partners"("id") ON DELETE CASCADE
);

CREATE TABLE "reward_redemptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "restaurantRewardId" UUID NOT NULL,
  "pointsSpent" INTEGER NOT NULL DEFAULT 0,
  "status" VARCHAR(32) NOT NULL DEFAULT 'REDEEMED',
  "redeemedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "reward_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "reward_redemptions_restaurantRewardId_fkey" FOREIGN KEY ("restaurantRewardId") REFERENCES "restaurant_rewards"("id") ON DELETE CASCADE
);

CREATE TABLE "driver_benefit_partners" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" VARCHAR(128) NOT NULL,
  "description" VARCHAR(500),
  "tier" VARCHAR(32),
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE "driver_benefit_redemptions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "driverProfileId" UUID NOT NULL,
  "partnerId" UUID NOT NULL,
  "benefitType" VARCHAR(64) NOT NULL,
  "description" VARCHAR(255),
  "pointsUsed" INTEGER NOT NULL DEFAULT 0,
  "redeemedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "status" VARCHAR(32) NOT NULL DEFAULT 'REDEEMED',
  CONSTRAINT "driver_benefit_redemptions_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "driver_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "driver_benefit_redemptions_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "driver_benefit_partners"("id") ON DELETE CASCADE
);

CREATE TABLE "support_tickets" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "category" VARCHAR(64) NOT NULL,
  "subject" VARCHAR(200) NOT NULL,
  "message" VARCHAR(2000) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  "priority" VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "support_tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "trip_shares" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "shareCode" VARCHAR(64) NOT NULL UNIQUE,
  "recipientPhone" VARCHAR(20),
  "sentAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "viewedAt" TIMESTAMPTZ,
  "status" VARCHAR(32) NOT NULL DEFAULT 'SENT',
  CONSTRAINT "trip_shares_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE,
  CONSTRAINT "trip_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "safety_incidents" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "bookingId" UUID,
  "userId" UUID NOT NULL,
  "incidentType" VARCHAR(64) NOT NULL,
  "severity" VARCHAR(32) NOT NULL DEFAULT 'MEDIUM',
  "description" VARCHAR(2000) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "safety_incidents_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL,
  CONSTRAINT "safety_incidents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "notifications" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "title" VARCHAR(200) NOT NULL,
  "body" VARCHAR(1000) NOT NULL,
  "type" VARCHAR(32) NOT NULL DEFAULT 'SYSTEM',
  "isRead" BOOLEAN NOT NULL DEFAULT FALSE,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE TABLE "audit_logs" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "actorUserId" UUID,
  "entityType" VARCHAR(128) NOT NULL,
  "entityId" VARCHAR(64) NOT NULL,
  "action" VARCHAR(32) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE TABLE "app_settings" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" VARCHAR(128) NOT NULL UNIQUE,
  "value" VARCHAR(1000) NOT NULL,
  "description" VARCHAR(500),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX "user_sessions_userId_idx" ON "user_sessions" ("userId");
CREATE INDEX "saved_addresses_userId_idx" ON "saved_addresses" ("userId");
CREATE INDEX "service_types_vehicleCategoryId_idx" ON "service_types" ("vehicleCategoryId");
CREATE INDEX "vehicles_driverProfileId_idx" ON "vehicles" ("driverProfileId");
CREATE INDEX "driver_documents_driverProfileId_idx" ON "driver_documents" ("driverProfileId");
CREATE INDEX "vehicle_documents_vehicleId_idx" ON "vehicle_documents" ("vehicleId");
CREATE INDEX "bookings_customerId_idx" ON "bookings" ("customerId");
CREATE INDEX "bookings_driverId_idx" ON "bookings" ("driverId");
CREATE INDEX "bookings_status_idx" ON "bookings" ("status");
CREATE INDEX "booking_stops_bookingId_sequence_idx" ON "booking_stops" ("bookingId", "sequence");
CREATE INDEX "booking_status_history_bookingId_createdAt_idx" ON "booking_status_history" ("bookingId", "createdAt");
CREATE INDEX "booking_assignments_bookingId_idx" ON "booking_assignments" ("bookingId");
CREATE INDEX "fare_breakdowns_fareEstimateId_idx" ON "fare_breakdowns" ("fareEstimateId");
CREATE INDEX "payment_records_bookingId_idx" ON "payment_records" ("bookingId");
CREATE INDEX "payment_records_userId_idx" ON "payment_records" ("userId");
CREATE INDEX "titanium_accounts_userId_idx" ON "titanium_accounts" ("userId");
CREATE INDEX "titanium_transactions_titaniumAccountId_idx" ON "titanium_transactions" ("titaniumAccountId");
CREATE INDEX "trip_bundle_items_tripBundleId_idx" ON "trip_bundle_items" ("tripBundleId");
CREATE INDEX "trip_bundle_credits_userId_idx" ON "trip_bundle_credits" ("userId");
CREATE INDEX "restaurant_rewards_restaurantPartnerId_idx" ON "restaurant_rewards" ("restaurantPartnerId");
CREATE INDEX "reward_redemptions_userId_idx" ON "reward_redemptions" ("userId");
CREATE INDEX "reward_redemptions_restaurantRewardId_idx" ON "reward_redemptions" ("restaurantRewardId");
CREATE INDEX "driver_benefit_redemptions_partnerId_idx" ON "driver_benefit_redemptions" ("partnerId");
CREATE INDEX "support_tickets_userId_idx" ON "support_tickets" ("userId");
CREATE INDEX "trip_shares_bookingId_idx" ON "trip_shares" ("bookingId");
CREATE INDEX "safety_incidents_bookingId_idx" ON "safety_incidents" ("bookingId");
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications" ("userId", "isRead");
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs" ("entityType", "entityId");
