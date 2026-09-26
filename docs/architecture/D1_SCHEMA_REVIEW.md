# CY Web D1 Schema Review

> Branch: `architecture/d1-schema-draft`
>
> Status: initial schema draft validated locally against SQLite semantics; **not yet applied to any production D1 database**.

## Current artifacts

- `docs/architecture/FINAL_DATA_DICTIONARY.md` — business/data contract input.
- `migrations/0001_initial.sql` — current clean-start D1 schema draft.
- `scripts/validate_schema.py` — zero-dependency local smoke validator using Python stdlib `sqlite3`.

No Cloudflare Worker, production D1 database, R2 binding, GCS runtime secret, or production dataset is created/changed by these files.

## Validation completed

The current `0001_initial.sql` was executed against an in-memory SQLite database with foreign-key enforcement enabled.

Validated results:

- schema creates successfully;
- `PRAGMA foreign_key_check` returns no violations after schema creation;
- 46 expected application tables are present;
- nullable Customer numbers allow pre-ERP Customers while duplicate non-null Customer numbers are rejected;
- Visit requires a real `customer_id`;
- Sales Work Order supports the confirmed name-only field-entry mode but rejects an unlinked order carrying a formal Customer number;
- a Customer Contact referenced by a Visit cannot be hard-deleted;
- a non-reviewed WorkLog cannot retain the cancelled review's current-effective review header fields;
- the shared Audit Core accepts a generic text `entity_key`, so non-integer operational entities such as a backup ID can use the same Audit Core.

## Schema refinements made during review

### D1 foreign-key behavior

The migration no longer attempts to use `PRAGMA foreign_keys = ON` as an application switch. D1 enforces foreign keys by default. Future migrations that temporarily need deferred validation should use the D1-supported `PRAGMA defer_foreign_keys` pattern rather than depending on disabling foreign-key enforcement.

### Referenced Customer Contacts

`customer_visits.contact_id` uses `RESTRICT` rather than silently nulling the relation. The Visit still keeps `person_snapshot`, but an already-referenced Contact follows the confirmed referenced-master retention principle and should normally be inactivated instead of physically deleted.

### WorkLog cancelled review data

The current review-only line fields are named `review_remark` and `review_score`, not historical `*_snapshot` fields. Cancel-review is expected to clear these current-effective fields together with the WorkLog review header values; the cancellation itself remains in Audit per BD-051.

No historical review-version table is introduced.

### Audit target key

`audit_events` uses a generic text `entity_key` rather than assuming every audited target has an integer primary key. Integer business-row IDs are encoded as their canonical decimal string; operational keys such as a backup ID can be stored directly. This keeps one Audit Core without adding parallel audit tables.

Audit payloads remain deliberately compact per BD-053/054.

## Still required before schema freeze

1. Reconcile the exact physical-column wording in `FINAL_DATA_DICTIONARY.md` with the reviewed SQL where the SQL review refined naming/constraints.
2. Run `scripts/validate_schema.py` from a normal checkout after each schema edit.
3. Once the actual Worker/Wrangler project exists, apply the migration to a **local/dev D1 target first** and run D1-specific smoke checks before any production database exists.
4. Define the initial lookup/configuration seed mechanism separately from production scoring values; Chihyuan production WorkLog parameters remain runtime configuration, not Public-source constants.
5. Freeze the migration only after the Data Dictionary and SQL are one-to-one and the local/dev D1 apply path passes.

## Cost / CI note

The schema validator intentionally requires no third-party package and is not wired to a GitHub Actions workflow at this stage. It can be run locally with:

```text
python scripts/validate_schema.py
```

This preserves the project's CI-cost discipline while the schema is still changing frequently. A lightweight CI gate can be added later when the schema stabilizes.
