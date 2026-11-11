# RAVERO Website

The single responsive React application for RAVERO's public, customer, driver, and admin areas. Route scaffolds are defined in `src/App.tsx`; portal authentication and role-based authorization remain deferred until backend identity is implemented.

Run the development server from the monorepo root:

```powershell
corepack pnpm dev:website
```

Build and type-check from the monorepo root with `corepack pnpm build` and `corepack pnpm typecheck`.
