# CY Web Local Development

> Scope: local development only. This document does not contain Chihyuan production resource identifiers or credentials.

## Prerequisites

- Node.js version supported by current Wrangler.
- npm.
- Python 3 for the zero-dependency source/schema validators.

## First setup

```bash
npm install
npm run validate:source
npm run typecheck
npm run db:migrate:local
npm run dev
```

The committed `wrangler.jsonc` uses a deliberately non-production local D1 configuration. `wrangler dev` and `wrangler d1 ... --local` operate on local state by default.

Do not add production D1 IDs, R2 bucket names, GCS credentials, API keys or other Chihyuan production identifiers to this Public repository.

## Useful commands

```bash
npm run validate:source
npm run typecheck
npm run build
npm run db:migrations:local
npm run db:migrate:local
npm run dev
```

`GET /api/health` verifies the Worker can access its D1 binding without exposing business data.

## Validation boundary

`validate:source` checks the SQL/schema contract and Public-safe foundation configuration without third-party Python packages. It does not replace the real Vite/Worker build or local D1 migration apply.

Before this branch is merge-ready, a normal networked checkout still needs to complete `npm install`, `npm run typecheck`, `npm run build`, local D1 migration apply and `/api/health` smoke verification.

## Production boundary

Production deployment is intentionally not configured in this foundation branch. The approved deployment/runtime boundary will inject real Cloudflare resource identifiers and secrets later, after local/dev acceptance.
