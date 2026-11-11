# RAVERO

RAVERO is a pnpm monorepo for two Expo mobile apps, one unified React website, a backend scaffold, and shared packages. Customer, driver, and admin website areas belong to the same `apps/website` application. This setup contains scaffolding only; business features and backend APIs are not implemented.

## Requirements

- Node.js 24 or a compatible current LTS release
- Corepack (included with Node.js) for the pinned pnpm version
- Android Studio and an Android emulator or device for native Android development

Install workspace dependencies from the repository root:

```powershell
corepack enable
corepack pnpm install
```

## Run applications

Run one project from the workspace root:

| Application | Command |
| --- | --- |
| Customer Android app | `corepack pnpm dev:customer-mobile` |
| Driver Android app | `corepack pnpm dev:driver-mobile` |
| Unified website | `corepack pnpm dev:website` |
| Backend scaffold | `corepack pnpm dev:backend` |

The Expo commands start the development server. To launch the Android target directly, run `corepack pnpm --filter @ravero/customer-mobile android` or `corepack pnpm --filter @ravero/driver-mobile android`. On Windows, a connected device or Android emulator is required.

The website's public, customer, driver, and admin routes are organized in the same React Router app. Portal authentication and role enforcement are intentionally placeholders until backend identity is implemented.

## Workspace checks

```powershell
corepack pnpm build
corepack pnpm lint
corepack pnpm typecheck
```

Each app has its own `.env.example` for local configuration. Copy only the variables needed by an app into its `.env` file. Environment files are ignored by Git; do not commit secrets. No external service credentials are required by this scaffold.

## Structure

```text
apps/
  customer-mobile/  Expo, React Native, TypeScript, Expo Router
  driver-mobile/    Expo, React Native, TypeScript, Expo Router
  website/          Single React, Vite, TypeScript, React Router, Tailwind site
  backend/          Node.js, Express, TypeScript scaffold
packages/
  shared/           Framework-neutral domain types and validation helpers
  config/           Shared TypeScript, ESLint, and Prettier configuration
  design-tokens/    Framework-neutral RAVERO brand tokens and web CSS tokens
docs/                Architecture and setup documentation
```

PostgreSQL, Prisma, Socket.IO, Redis, maps, payments, Firebase, and business APIs have not been connected.
