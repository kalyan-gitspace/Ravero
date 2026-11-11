# RAVERO Database Schema

This document describes the shared RAVERO PostgreSQL schema. The initial schema and the approved additive customer-authentication migration are applied to the local `ravero_db` database.

## Design principles

- One shared database for the customer app, driver app, unified website, and admin portal.
- PostgreSQL local-only for the current development phase.
- UUID primary keys for portable, cross-service identifiers.
- Explicit timestamps for auditing and traceability.
- Monetary values stored using decimal/numeric columns.
- Status fields use explicit enumerated values instead of free-form strings.
- Soft deletion is intentionally avoided at this stage; hard deletion is controlled by application rules and admin review.
- Database access is routed through the central Express backend. Mobile and web clients do not connect directly to PostgreSQL.

## Core entities and relationships

### 1. Identity and access

- users: primary authentication identity table for customers, drivers, and admins.
- roles: system roles such as CUSTOMER, DRIVER, ADMIN.
- permissions: granular access definitions.
- role_permissions: many-to-many relationship between roles and permissions.
- user_role_assignments: explicit user-to-role assignments.
- user_sessions: refresh-token/session tracking.
- otp_challenges: one-time phone verification challenges with keyed code hashes, expiry, attempt count, and consumption timestamp.

Relationships:

- users -> user_role_assignments -> roles
- roles -> role_permissions -> permissions
- users -> user_sessions
- normalized E.164 phone numbers are unique in `users`; OTP challenge phone numbers follow the same format.
- `user_sessions.refreshTokenHash` stores a SHA-256 hash instead of a bearer token; `revokedAt` records logout/revocation.

### 2. Profiles

- customer_profiles: customer-specific metadata, emergency info, and profile fields.
- driver_profiles: driver verification metadata, status, preferred operating areas, and trip performance.
- admin_profiles: internal admin profile details.

Relationships:

- users -> customer_profiles (one-to-one)
- users -> driver_profiles (one-to-one)
- users -> admin_profiles (one-to-one)

### 3. Locations and saved addresses

- saved_addresses: user-specific saved locations and favourite pickup/drop-off addresses.
- service_areas: geography or service region definitions, such as Hyderabad and nearby operating corridors.

Relationships:

- users -> saved_addresses
- bookings reference pickup and dropoff addresses from saved_addresses

### 4. Vehicles and documents

- vehicle_categories: Auto, Cab, Two-wheeler, or other service categories.
- service_types: booking service types mapped to a vehicle category.
- vehicles: driver-owned vehicles.
- driver_documents: documents required for onboarding and verification.
- vehicle_documents: documents related to an individual vehicle.

Relationships:

- driver_profiles -> vehicles
- driver_profiles -> driver_documents
- vehicles -> vehicle_documents
- vehicle_categories -> service_types -> bookings

### 5. Bookings and trip workflow

- bookings: central booking record.
- booking_stops: multi-stop trip itinerary.
- booking_status_history: immutable booking state timeline.
- booking_assignments: driver assignment and acceptance/rejection status.

Relationships:

- users (customer) -> bookings
- users (driver) -> bookings (optional assignment)
- bookings -> booking_stops
- bookings -> booking_status_history
- bookings -> booking_assignments

### 6. Fare, payment, and commission

- fare_estimates: value estimate before booking completion.
- fare_breakdowns: line-item charge components.
- payment_records: cash/UPI/card/wallet payment events.
- platform_commissions: revenue share or platform fee entries for bookings.

Relationships:

- bookings -> fare_estimates -> fare_breakdowns
- bookings -> payment_records
- bookings -> platform_commissions

### 7. Titanium rewards and bundles

- titanium_accounts: rewards ledger for a customer.
- titanium_transactions: points/credits accrual and spend ledger.
- reward_rules: automated reward conditions.
- trip_bundles: bundle offers sold to users.
- trip_bundle_items: contents and bundled values.
- trip_bundle_credits: user-specific bundle credits and expiry.

Relationships:

- users -> titanium_accounts -> titanium_transactions
- users -> trip_bundle_credits -> trip_bundles

### 8. RAVERO Treats and driver benefits

- restaurant_partners: partner restaurants for RAVERO Treats.
- restaurant_rewards: reward offers in restaurant partner programs.
- reward_redemptions: customer redemptions of restaurant rewards.
- driver_benefit_partners: partner benefits for drivers.
- driver_benefit_redemptions: redeemed driver benefits.

Relationships:

- restaurant_partners -> restaurant_rewards -> reward_redemptions -> users
- driver_benefit_partners -> driver_benefit_redemptions -> driver_profiles

### 9. Support, safety, notifications, and audit

- support_tickets: issue tracking from customers or drivers.
- trip_shares: trip-sharing links for family or safety use.
- safety_incidents: safety and incident reporting.
- notifications: user-facing in-app notifications.
- audit_logs: change history for operational review.
- app_settings: operational flags and feature toggles.

Relationships:

- users -> support_tickets
- users -> notifications
- users -> safety_incidents
- bookings -> trip_shares
- bookings -> safety_incidents
- users -> audit_logs

## Proposed table summary

The migration in `apps/backend/prisma/migrations/20251110000000_initial_schema/migration.sql` defines a working first-pass schema covering all of the above modules without introducing excessive duplication. The migration intentionally omits extra tables that are not yet required by the current product stage.

The additive customer authentication migration in `apps/backend/prisma/migrations/20261110000000_customer_otp_auth/migration.sql` adds the `otp_challenges` table, E.164 phone constraints, `customer_profiles.profileImageUrl`, and hashed/revocable refresh-token columns. Existing refresh-token values are hashed in place during this additive migration; no rows are deleted.

The follow-up migration in `apps/backend/prisma/migrations/20261110010000_align_user_status_enum/migration.sql` aligns the existing `users.status` column with the Prisma `UserStatus` enum. It preserves the existing status values and replaces the equivalent check constraint with the enum constraint.

## Constraints and indexes

Key constraints and indexes include:

- UUID primary keys using PostgreSQL `gen_random_uuid()` defaults.
- Unique constraints on important business keys such as emails, phone numbers, role names, and service codes.
- Required foreign keys from bookings to customer and service records.
- E.164 format checks for account and OTP challenge phone numbers.
- OTP attempt-count checks and transaction-scoped PostgreSQL advisory locks to enforce per-phone resend limits safely.
- A unique index on the session refresh-token hash, with expiry and revocation timestamps.
- Indexes on customerId, driverId, service type, and status values for route and reporting queries.
- Numeric columns use `DECIMAL(10,2)` for fare and reward values to avoid floating-point errors.
- JSONB fields are used for notification payloads and audit metadata.

## Local database guidance

Local database configuration is expected as:

- Database name: `ravero_db`
- Host: `localhost`
- Port: `5432`
- Protocol: PostgreSQL (local only)
- Environment variable: `DATABASE_URL`

Example shape only:

DATABASE_URL="postgresql://USERNAME@localhost:5432/ravero_db"

No credentials are stored in this repository. The actual local username and password must be supplied securely by the developer.

## Migration safety

The customer authentication migration was applied using Prisma `migrate deploy`. It adds a table, columns, indexes, and constraints; it does not drop tables, truncate records, or reset the database. Existing refresh-token values, if any, are hashed in place.

## Operational notes

Next steps:

1. Keep the actual local `DATABASE_URL` in the ignored backend `.env` file.
2. Use `pnpm --filter @ravero/backend exec prisma migrate deploy` for reviewed migrations.
3. Use `pnpm --filter @ravero/backend db:seed` for idempotent development reference data.
4. Validate health endpoints and database readiness through the backend.
