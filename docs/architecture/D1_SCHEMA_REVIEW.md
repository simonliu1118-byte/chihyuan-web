# CY Web D1 Schema Review

> Status: **initial relational schema frozen** after source validation plus Wrangler local D1 + Worker runtime acceptance through the `0.1.41` domain gate. The frozen schema has not been applied to production D1, and no remote production/development D1 identifier is committed to this Public repository.

## Current authoritative artifacts

- `docs/architecture/FINAL_DATA_DICTIONARY.md` — physical/business data contract.
- `migrations/0001_initial.sql` — initial clean-start schema.
- `migrations/0002_defect_invalidation.sql` — Defect invalidation overlay migration.
- `scripts/validate_schema.py` — zero-dependency SQLite/source shape validator.
- `scripts/validate_d1_local.py` — repeatable Wrangler local D1 runtime acceptance driver.

The forward migration source of truth is `migrations/`. The accepted `0001 + 0002` chain is now the frozen initial relational baseline; later data-model changes require an explicit new forward migration rather than editing the accepted baseline or making manual Dashboard drift.

## Source/schema validation

The frozen chain creates the expected 46-table application schema and validates key structural/business constraints, including:

- nullable pre-ERP Customer numbers with uniqueness for non-null Customer numbers;
- Visit → Customer and referenced Contact retention behavior;
- confirmed Sales Work Order customer-entry modes;
- WorkLog cancelled-review current-state shape;
- generic text Audit `entity_key`;
- Defect invalidation metadata layered on the three-state workflow.

## Wrangler local D1 runtime acceptance

The accepted migration chain is:

```text
0001_initial.sql
0002_defect_invalidation.sql
```

The repeatable local gate creates fresh temporary Wrangler D1 state, applies the migrations, starts the acceptance-only Worker against that same persisted state, exercises the current services/persistence, and deletes the temporary state after the run.

### Core D1 gate

The `0.1.40` work item proved:

- migrations apply successfully and are recorded by D1;
- reapplying the migration command is a safe no-op/success path;
- Customer create with owned child rows through existing `D1Database.batch()` persistence;
- Customer update with existing + newly inserted child rows;
- optimistic revision conflict rejection without stale mutation;
- a later failing statement rolls back earlier statements in the same D1 batch;
- business mutation + conditional Audit insert succeed atomically in one batch;
- scaled fixed-point integer values round-trip exactly through D1 storage;
- foreign-key enforcement rejects an invalid Customer Visit relation;
- `0002_defect_invalidation.sql` produces `invalidated_at` and `invalidated_by` on `defect_reports`.

This gate exposed a real Customer child-persistence ordering defect: newly inserted child rows were followed by omission cleanup and could be deleted again in the same batch. The persistence order was corrected so omission cleanup runs before new child inserts.

### Domain-specific freeze gate

The `0.1.41` work item then exercised the remaining schema-freeze scenarios through the current domain services on Wrangler local D1:

#### Item

- ItemService persists a chained conversion graph (`CASE -> BOX -> EA`);
- scaled4 conversion factors round-trip from D1 exactly;
- chained quantity conversion is exact at scaled4 precision;
- scaled4 quantity × scaled4 unit price produces exact money2 when representable, with no hidden floating-point authority.

#### Contractor / Outsourcing

- `pending_outbound` remains plan-only and does not change contractor stock;
- confirmed outbound creates base-unit `outbound_supply` movements;
- correction preserves the old movement, writes a linked reversal, replaces the current part snapshot and writes replacement outbound movement(s);
- derived contractor stock equals the replacement physical fact after correction;
- cancel outbound writes a linked reversal for the active replacement movement, moves the order to `voided`, and reconciles derived stock to zero.

#### WorkLog

- owner create and `created -> pending_review` submit work against D1;
- authorized review persists reviewer-corrected Work Days, per-entry review values, finalized total score and deterministic average-daily score;
- statistics read the stored finalized reviewed result rather than recalculating from configuration;
- `reviewed -> pending_review` cancel-review clears the current finalized review projection and per-entry review values;
- submit/review/cancel-review Audit events are retained.

Runtime Check `#66` passed the complete acceptance set together with source contracts, browser TypeScript, Worker TypeScript and Vite build.

## Freeze decision

The initial relational schema is frozen because all schema gates previously listed in this review have passed against the current service/persistence implementation and the actual Wrangler local D1 runtime.

From this point forward:

1. do not redesign the relational schema for ordinary UI/layout changes;
2. do not rewrite accepted migration semantics in place merely for implementation convenience;
3. a real data-model requirement must be reviewed against the applicable Business Decision / Final Data Dictionary;
4. implement approved schema evolution through a new numbered forward migration;
5. keep the local D1 acceptance harness green and extend it when a new migration introduces new critical semantics.

A separate remote non-production D1 deployment may still be added later as a deployment/integration acceptance step. That does not reopen the frozen initial relational model by itself.

## Production boundary

Schema freeze is **not** production acceptance. Protected multi-user operation still requires Shared Identity/session wiring, protected Worker HTTP routes, API-backed React persistence, browser/device acceptance, backup/restore acceptance, and explicit production rollout approval.

No production D1 data, Worker deployment, DNS, R2/GCS resource or SMART ERP data was modified by this schema-freeze acceptance work.
