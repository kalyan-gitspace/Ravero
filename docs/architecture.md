# Architecture

The RAVERO pnpm workspace contains customer and driver mobile apps, one unified website, a central backend, and shared packages. The website hosts public, customer, driver, and admin areas in a single React application. Mobile and website UI code remain separate; only framework-neutral types, validation logic, and design tokens are shared.

## Monorepo structure

- apps/customer-mobile: customer Android app built with React Native and Expo.
- apps/driver-mobile: driver Android app scaffold with Expo.
- apps/website: single website containing public, driver, customer, and admin experiences.
- apps/backend: central Express + TypeScript backend service for API work, validation, and PostgreSQL access.
- packages/shared: shared interfaces, types, validation helpers, and business logic.
- packages/config: ESLint, TypeScript, and formatting configuration.
- packages/design-tokens: shared black-and-white design system tokens.
- docs: architecture and database documentation.

## Application responsibilities

### Customer mobile app

- ride booking and trip planning UI
- pickup and drop-off workflows
- booking history and profile surfaces
- rewards and trip bundle mock UX
- premium black-and-white mobility interface

### Driver mobile app

- onboarding workflow
- trip assignment and management screens
- revenue and benefit presentation
- document status and profile management

### Unified website

- marketing and public pages
- customer portal sections
- driver registration and dashboard views
- admin portal and operational surfaces in a single React application

### Backend

- central API layer for all clients
- database connectivity and schema management
- validation, health checks, and structured error responses
- future real-time, payment, mapping, and business services

## Shared package responsibilities

### packages/shared

- business/domain types
- booking and fare models
- user and driver types
- validation utilities
- environment-safe, framework-neutral logic

### packages/config

- TypeScript configuration
- linting and formatting defaults
- project-wide standards

### packages/design-tokens

- black-and-white palette
- typography, spacing, and radii
- reusable design-system values for web and mobile consistency

## Design system principles

- White background surfaces with black typography.
- Black primary buttons with white text.
- Grey secondary text and subtle borders.
- Minimal, premium, mobile-first interfaces.
- Clear spacing, soft corners, and restrained motion.
- Avoid gradients, bright accent colours, and unnecessary decoration.
- React Native and web styles remain separated for framework compatibility.

## Backend and PostgreSQL foundation

The backend uses Prisma with the local PostgreSQL database `ravero_db`. Environment validation enforces a local-only `DATABASE_URL` target, and health endpoints do not reveal credentials or sensitive database details.

The customer authentication foundation now includes phone OTP registration/login, short-lived signed access tokens, rotating hashed refresh tokens, session revocation, and customer profile read/update endpoints. OTP values are HMAC-hashed at rest, expire after five minutes, and are limited by attempt count, resend cooldown, per-number send cap, and per-IP rate limits.

The development OTP provider exposes the generated code only to loopback requests when `NODE_ENV=development`; the development server binds to loopback. A real SMS provider remains unconfigured. The in-memory IP limiter is intended for the single local backend process and must be replaced with a shared store before horizontal scaling.

The database schema proposal covers:

- users, profiles, and access control
- vehicles, service areas, and driver documents
- bookings, stops, assignments, and status changes
- fares, payment records, and commission entries
- Titanium rewards and trip bundle logic
- RAVERO Treats, restaurant rewards, and benefit partners
- support, safety, notifications, audit logging, and app settings

The initial schema and additive customer-authentication migrations are versioned in the backend. The authentication migrations add OTP challenges, profile image support, phone-format validation, refresh-token hashing, and session revocation, and align the existing `users.status` column with the Prisma enum without resetting existing data.

## Development commands

Root workspace:

- pnpm install
- pnpm build
- pnpm typecheck
- pnpm lint

Customer mobile:

- pnpm --filter @ravero/customer-mobile start

Driver mobile:

- pnpm --filter @ravero/driver-mobile start

Unified website:

- pnpm --filter @ravero/website dev

Backend:

- pnpm --filter @ravero/backend dev
- pnpm --filter @ravero/backend build
- pnpm --filter @ravero/backend typecheck
- pnpm --filter @ravero/backend test
- pnpm --filter @ravero/backend lint

Database commands (local PostgreSQL):

- pnpm --filter @ravero/backend prisma generate
- pnpm --filter @ravero/backend prisma migrate dev --name init
- pnpm --filter @ravero/backend db:seed

The initial and customer-authentication migrations have been applied to local `ravero_db`. Future migrations must be reviewed before deployment; `migrate deploy` applies pending versioned migrations without resetting data.
