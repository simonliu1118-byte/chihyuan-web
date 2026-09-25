# CY Web Architecture Documents

This directory contains the current architecture/design record for **Chihyuan Enterprise Management System (CY Web)**.

These documents are not a fourth governance layer. Permanent rules remain in the repository root:

1. `REPOSITORY_RULES.md`
2. `REPO_POLICY.md`
3. `PROJECT_RULES.md`

For product/architecture semantics, current explicit user decisions and later confirmed Business Decisions supersede older drafts or audit notes.

## Current document map

### Active working documents

- `decisions/README.md` — index of confirmed Business Decisions and supersession notes.
- `BUSINESS_DECISIONS.md` — consolidated summary for BD-001 through BD-018. Detailed pre-consolidation text is preserved under `archive/`.
- `decisions/BD-019.md` through the latest `BD-*.md` — later detailed decisions.
- `CANONICAL_DATA_MODEL.md` — current working logical model. This is the input to the final Data Dictionary and D1 schema, not a copy of Legacy Sheet headers.
- `CLOUDFLARE_PUBLIC_DEPLOYMENT_PRINCIPLES.md` — Public-source / production-infrastructure separation.

### Legacy evidence documents

- `LEGACY_DATA_AUDIT.md`
- `LEGACY_DESKTOP_WORKFLOW_AUDIT.md`

These are reference indexes after consolidation. Their original detailed contents are preserved verbatim under `archive/`.

Legacy evidence is used to understand behavior and semantics. It is **not** a production migration contract.

### Archive

`archive/` contains preserved pre-consolidation architecture documents. Archived files are historical evidence only and must not be treated as the current source of product truth when they conflict with later confirmed decisions.

## Current architecture baseline

As of the consolidation through BD-048:

- CY Web is a single Web application for Desktop / Tablet / Mobile with RWD + Adaptive UI.
- SMART ERP remains the primary ERP; CY Web complements it for Web/mobile workflows and extension data.
- Cloudflare is the target application platform; D1 is the live relational database direction.
- Shared Identity is reused through an adapter/service boundary; CY Web does not duplicate the common account hierarchy.
- GCS is the initial Chihyuan production off-site backup provider behind a provider-neutral backup contract.
- Legacy GAS / Google Sheets has not entered production use. Existing rows are disposable development/test data and are **not migrated** into production D1 (BD-047).
- Production starts from a clean canonical D1 schema.
- Customer and Item relationships use immutable internal IDs. ERP business identifiers remain separate fields.
- SMART ERP customer numbers may be corrected/changed without changing Customer identity (BD-048).

## Document precedence inside architecture work

When two architecture documents appear to disagree, use this order:

1. current explicit user decision;
2. latest applicable confirmed `BD-*` decision, including explicit supersession notes;
3. current `CANONICAL_DATA_MODEL.md`;
4. current workflow/audit summary;
5. archived/pre-consolidation evidence.

If a conflict remains after applying that order, stop and resolve it before freezing the D1 Data Dictionary or implementing business logic.

## Next architecture gate

The previous Legacy-data-migration gate is retired by BD-047.

The current gate is:

```text
confirmed Business Decisions
        ↓
consolidated Canonical Data Model
        ↓
remaining genuinely open business semantics only
        ↓
Final Data Dictionary
        ↓
D1 SQL schema / forward migrations
        ↓
Worker + API contracts
        ↓
module implementation and acceptance
```

Do not re-open already confirmed business questions merely because an older draft still contains an `OPEN` marker. Check `decisions/README.md` first.
