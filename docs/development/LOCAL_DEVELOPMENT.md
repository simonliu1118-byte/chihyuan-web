# CY Web Local Development

> Scope: local development and non-production acceptance only. This document does not contain Chihyuan production resource identifiers or credentials.

## Prerequisites

- Node.js version supported by current Wrangler.
- npm.
- Python 3 for the zero-dependency source/schema validators and local D1 acceptance driver.

## First setup

```bash
npm install
npm run validate:source
npm run typecheck
npm run validate:d1:local
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
npm run validate:d1:local
npm run dev
```

`GET /api/health` verifies the normal Worker can access its configured D1 binding without exposing business data.

## Local D1 acceptance

`npm run validate:d1:local` is the repeatable runtime regression gate for the frozen initial migration chain and critical D1 domain semantics.

It deliberately uses a **fresh temporary Wrangler local D1 state** and does not reuse ordinary developer data. The validator:

1. applies the committed forward migrations through Wrangler local D1;
2. confirms the expected migration records exist;
3. reapplies the chain to prove the normal migration command is safely repeatable;
4. starts the dedicated acceptance-only Worker against the same temporary local D1 state;
5. exercises real D1 `batch()` / constraint behavior through the existing application persistence/services;
6. removes the temporary state after the run.

Current checks cover:

- Customer master + child-row batch persistence;
- optimistic revision conflict rejection;
- failed-batch rollback;
- business mutation + Audit atomic batch behavior;
- exact fixed-point integer persistence;
- foreign-key enforcement;
- Defect invalidation migration columns;
- Item chained unit conversion and exact scaled4/money2 arithmetic;
- Outsourcing pending plan-only behavior, confirmed outbound stock, correction reversal/replacement, cancellation and derived-stock reconciliation;
- WorkLog submit/review/cancel-review, corrected Work Days, finalized scores, stored-result statistics and Audit sequence.

The acceptance Worker entrypoint is `worker/acceptance/d1-local-acceptance.ts` and is wired only through `wrangler.d1-acceptance.jsonc`. It is not the production Worker entrypoint and does not create or access a remote D1 database.

## Validation boundary

`validate:source` checks current source/schema contracts without third-party Python packages. `validate:d1:local` complements it by exercising the actual Wrangler local D1 runtime. Neither substitutes for later authenticated multi-user, remote deployment, backup/restore, or real-browser/device acceptance.

The Runtime Check CI runs source contracts, browser/Worker TypeScript, the local D1 acceptance gate and the Vite build before relevant work is merge-ready.

The initial relational schema is frozen at the current accepted migration baseline. If a later approved data-model change adds a new numbered migration, extend this acceptance harness when needed to cover the new critical semantics rather than weakening or bypassing the existing gate.

## Production boundary

Production deployment is intentionally not configured by local development files. The approved deployment/runtime boundary will inject real Cloudflare resource identifiers and secrets only after the applicable non-production acceptance gates pass.
