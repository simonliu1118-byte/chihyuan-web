# CY Web D1 Schema Review

> Status: initial relational schema is source-validated and has passed the first Wrangler local D1 + Worker runtime acceptance gate. It is **not yet frozen** and has not been applied to production D1.

## Current authoritative artifacts

- `docs/architecture/FINAL_DATA_DICTIONARY.md` — physical/business data contract.
- `migrations/0001_initial.sql` — initial clean-start schema.
- `migrations/0002_defect_invalidation.sql` — Defect invalidation overlay migration.
- `scripts/validate_schema.py` — zero-dependency SQLite/source shape validator.
- `scripts/validate_d1_local.py` — repeatable Wrangler local D1 runtime acceptance driver.

The forward migration source of truth is `migrations/`; schema changes must continue through forward migrations rather than manual Dashboard drift.

## Source/schema validation

The current chain creates the expected 46-table application schema and validates key structural/business constraints, including:

- nullable pre-ERP Customer numbers with uniqueness for non-null Customer numbers;
- Visit → Customer and referenced Contact retention behavior;
- confirmed Sales Work Order customer-entry modes;
- WorkLog cancelled-review current-state shape;
- generic text Audit `entity_key`;
- Defect invalidation metadata layered on the three-state workflow.

## Wrangler local D1 runtime acceptance

The `0.1.40` work item added a real Worker + Wrangler local D1 acceptance path using fresh temporary state. The accepted migration chain is:

```text
0001_initial.sql
0002_defect_invalidation.sql
```

The current core runtime gate has passed all of the following against Wrangler local D1:

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

This acceptance exposed a real Customer child-persistence ordering defect: newly inserted child rows were followed by omission cleanup and could be deleted again in the same batch. The persistence order was corrected so omission cleanup runs before new child inserts.

## What this acceptance does not prove

The first local D1 gate is intentionally a core runtime gate. It does not yet complete every domain-specific schema-freeze scenario.

Still required before the initial schema is marked frozen:

1. exercise Item conversion/fixed-point domain behavior beyond raw integer round-trip;
2. exercise Outsourcing confirmed movement, reversal/replacement and derived-stock behavior against D1;
3. exercise WorkLog submit/review/cancel-review transitions and finalized result persistence against D1;
4. confirm any remaining domain-specific transactional/Audit invariants that depend on D1 statement ordering;
5. keep source validators and Worker/browser typechecks green after those acceptance cases.

A separate remote non-production D1 deployment may be added later when its runtime/config boundary is deliberately provisioned. No production or remote D1 identifier is committed to this Public repository, and remote provisioning is not required to claim the current **Wrangler local D1** acceptance result.

## Schema-freeze rule

UI layout changes do not justify redesigning the relational schema. Once the remaining domain-specific D1 acceptance cases pass, freeze the initial relational schema and require later data-model changes to use explicit forward migrations with the applicable Business Decision/data-contract review.

Until then, `TODO.md` is the current progress tracker; this document records the D1/schema acceptance boundary rather than PR/branch checkpoint metadata.
