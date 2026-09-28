# Legacy Data Audit — Reference Index

> Project: Chihyuan Enterprise Management System (CY Web)
>
> Status: historical/reference evidence only. The full pre-consolidation audit is preserved at `archive/LEGACY_DATA_AUDIT_PRE_CONSOLIDATION.md`.

## Current role

The Legacy GAS / Google Sheets system was audited to understand:

- functional domains and field semantics;
- master vs child vs snapshot relationships;
- validation and identifier behavior;
- embedded JSON/compound structures;
- settings/lookups and audit/history intent.

That audit was useful for designing the new canonical model, but the current Legacy dataset has not entered production use.

Per BD-047:

- existing Legacy rows are disposable development/test data;
- production CY Web does not import that dataset into D1;
- value-level profiling for migration acceptance is not required;
- Legacy IDs/row shapes/old aliases do not need production compatibility structures solely for migration;
- `legacy_id_map` and a Google Sheets → D1 importer are not part of the launch architecture.

## Current source order

Use Legacy data/source evidence only after checking:

1. current explicit user decisions;
2. confirmed Business Decisions in `decisions/README.md`;
3. current `CANONICAL_DATA_MODEL.md`;
4. Legacy evidence where a behavior/semantic question remains unclear.

Do not restore an old migration assumption simply because it appears in the archived audit.

## Useful conclusions retained from the audit

The audit helped establish several durable design directions that are now captured by confirmed decisions/current canonical docs, including:

- immutable internal IDs separated from ERP business numbers;
- normalized Customer phones/contacts/addresses/notes;
- formal document snapshot semantics;
- Item-number remapping/history;
- Contractor identity separate from names;
- BOM/Outsourcing/stock-movement normalization;
- WorkLog scoring/history structure;
- configurable lookups separated from fixed workflow states;
- structured audit rather than opaque Legacy log cells.

Those requirements should now be read from the Business Decisions and current canonical model, not inferred again from Legacy Sheet headers.

## Detailed historical audit

For traceability only, see:

`archive/LEGACY_DATA_AUDIT_PRE_CONSOLIDATION.md`
