# CY Web D1 Schema Review

> Status: **initial relational business schema frozen** after source validation plus Wrangler local D1 + Worker runtime acceptance through the `0.1.41` domain gate. The frozen baseline has not been applied to production D1. `0.1.42` adds the first explicit post-freeze forward migration for the temporary CY Web browser-session projection without rewriting the frozen baseline.

## Current authoritative artifacts

- `docs/architecture/FINAL_DATA_DICTIONARY.md` — physical/business data contract.
- `migrations/0001_initial.sql` — initial clean-start schema.
- `migrations/0002_defect_invalidation.sql` — Defect invalidation overlay migration.
- `migrations/0003_identity_web_sessions.sql` — post-freeze temporary Identity session projection.
- `scripts/validate_schema.py` — zero-dependency SQLite/source shape validator.
- `scripts/validate_d1_local.py` — repeatable Wrangler local D1 runtime acceptance driver.

The forward migration source of truth is `migrations/`. The accepted `0001 + 0002` chain remains the frozen initial relational business baseline. Later changes must use explicit numbered forward migrations rather than editing accepted migrations or creating manual Dashboard drift.

## Frozen initial baseline

The frozen `0001 + 0002` baseline creates the original 46-table application schema and validates key structural/business constraints, including:

- nullable pre-ERP Customer numbers with uniqueness for non-null Customer numbers;
- Visit → Customer and referenced Contact retention behavior;
- confirmed Sales Work Order customer-entry modes;
- WorkLog cancelled-review current-state shape;
- generic text Audit `entity_key`;
- Defect invalidation metadata layered on the three-state workflow.

### Core D1 gate — 0.1.40

Wrangler local D1 proved:

- migrations apply successfully and are recorded by D1;
- reapplying the migration command is a safe no-op/success path;
- Customer create/update with owned child rows through existing `D1Database.batch()` persistence;
- optimistic revision conflict rejection without stale mutation;
- a later failing statement rolls back earlier statements in the same D1 batch;
- business mutation + conditional Audit insert succeed atomically in one batch;
- scaled fixed-point integer values round-trip exactly through D1 storage;
- foreign-key enforcement rejects invalid relations;
- `0002_defect_invalidation.sql` produces the accepted Defect invalidation columns.

That gate exposed and fixed a real Customer child-persistence ordering defect: omission cleanup had to run before newly inserted child rows.

### Domain-specific freeze gate — 0.1.41

The remaining schema-freeze scenarios passed through the current domain services on Wrangler local D1.

#### Item

- chained conversion graph persists through ItemService;
- scaled4 factors round-trip exactly;
- chained quantity conversion remains exact;
- scaled4 quantity × scaled4 unit price produces exact money2 when representable.

#### Contractor / Outsourcing

- `pending_outbound` remains plan-only;
- confirmed outbound creates base-unit stock movements;
- correction preserves original movement facts and writes linked reversal + replacement movements;
- derived stock reconciles to the replacement physical fact;
- cancel outbound reverses the active replacement and reconciles derived stock to zero.

#### WorkLog

- create/submit/review/cancel-review transitions persist correctly;
- reviewer-corrected Work Days and finalized score/average persist;
- statistics read stored finalized reviewed results;
- cancel-review clears the current finalized review projection;
- workflow Audit events remain traceable.

Runtime Check `#66` passed the complete domain acceptance set together with source contracts, browser TypeScript, Worker TypeScript and Vite build.

## Freeze decision

The initial relational business schema is frozen because every schema gate previously listed for the initial model passed against the current service/persistence implementation and the Wrangler local D1 runtime.

From this point forward:

1. do not redesign the relational schema for ordinary UI/layout changes;
2. do not rewrite accepted migration semantics in place merely for implementation convenience;
3. a real data-model/runtime requirement must be reviewed against the applicable architecture contract;
4. implement approved schema evolution through a new numbered forward migration;
5. keep the local D1 acceptance harness green and extend it when a new migration introduces critical semantics.

## Post-freeze migration — 0003 Identity browser sessions

`0003_identity_web_sessions.sql` is the first migration added after the initial freeze. It does **not** reopen or modify `0001` / `0002` business semantics.

Purpose:

- store CY Web's own short-lived browser-session projection while the existing employee-account provider is temporarily reused;
- link a session to the stable external employee identity through the local `app_members` projection;
- store only session/identity snapshot fields needed for CY Web request resolution;
- never store password verifiers, OTP/recovery material or provider secrets.

The migration adds `web_sessions` with constrained shared-role values, expiry metadata and local identity linkage. The Wrangler local D1 gate applies `0003` and verifies a real D1 session row round-trip.

Provider ownership remains outside this schema: CY Web does not read the current provider database and the current provider Service Binding/application target is injected by deployment configuration.

## Production boundary

Schema freeze and the `0003` local migration acceptance are **not** production acceptance. Protected multi-user operation still requires:

- real non-production `IDENTITY` Service Binding acceptance against the existing account service;
- protected Worker HTTP routes with server-side module/domain authorization;
- API-backed React business-data persistence;
- final Shared Identity extraction/role/revocation acceptance;
- browser/device acceptance;
- backup/restore acceptance;
- explicit production rollout approval.

No production D1 data, Worker deployment, DNS, R2/GCS resource, CYInvoice Cloud runtime or SMART ERP data was modified by the local schema/Identity bridge work.
