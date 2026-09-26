# CY Web Architecture Documents

This directory contains the current architecture/design record for **Chihyuan Enterprise Management System (CY Web)**.

These documents are not a fourth governance layer. Permanent rules remain in the repository root:

1. `REPOSITORY_RULES.md`
2. `REPO_POLICY.md`
3. `PROJECT_RULES.md`

For product/architecture semantics, current explicit user decisions and later confirmed Business Decisions supersede older drafts or audit notes.

## Current document map

### Active architecture / implementation contracts

- `decisions/README.md` — confirmed Business Decision index and supersession/refinement map.
- `BUSINESS_DECISIONS.md` — consolidated BD-001 through BD-018 summary.
- `decisions/BD-019.md` through the latest `BD-*.md` — later detailed decisions.
- `CANONICAL_DATA_MODEL.md` — current logical model.
- `FINAL_DATA_DICTIONARY.md` — current initial relational/physical Data Dictionary aligned with the D1 schema draft.
- `D1_SCHEMA_REVIEW.md` — schema validation state, refinements and remaining freeze gate.
- `API_CONTRACT.md` — initial Worker/API envelope, error, cache, validation and concurrency contract.
- `REQUEST_FOUNDATION.md` — shared browser API client, request-state model, Worker JSON parsing/response and field-validation foundation.
- `IDENTITY_ADAPTER.md` — shared-Identity adapter boundary, normalized principal contract and CY Web app-local authorization split.
- `AUDIT_CORE.md` — one shared CY Web AuditService contract, concise timeline/detailed Audit Log split and storage-cost safeguards.
- `UI_FOUNDATION.md` — new-Web shared UI/interaction architecture, Adaptive UI boundary and pre-business-screen shared-component gate.
- `BACKUP_ARCHITECTURE.md` — tiered R2 + GCS backup topology and provider/service boundary.
- `CLOUDFLARE_PUBLIC_DEPLOYMENT_PRINCIPLES.md` — Public-source / production-infrastructure separation.
- `../DOMAIN_STRATEGY.md` — confirmed `chihyuancm.com` parent-domain namespace and controlled rollout direction for the official website and CY-family Web systems.

### Implementation handoffs

- `../handoffs/CYACCOUNTINGWEB_TIERED_BACKUP_HANDOFF.md` — public-safe handoff for the CYAccountingWeb workstream. CY Web does not modify Accounting source/runtime from this workstream.
- `../handoffs/CYWEB_IDENTITY_PROVIDER_REQUIREMENTS.md` — requirements handed to the Shared Identity/CYInvoice workstream for CY Web-compatible browser-session support.

### Legacy evidence

- `LEGACY_DATA_AUDIT.md`
- `LEGACY_DESKTOP_WORKFLOW_AUDIT.md`
- `LEGACY_REUSABLE_PATTERN_AUDIT.md` — cross-module review of repeated Legacy behavior/UI patterns and the pre-UI shared-component extraction gate.

Their detailed historical versions remain under `archive/`. Legacy evidence explains behavior/semantics; it is not a production migration contract or a screen blueprint.

## Current architecture baseline

As of the decisions through BD-056 and the initial D1/API/Identity/Audit/UI/request foundation:

- CY Web is one Web application for Desktop / Tablet / Mobile using RWD + Adaptive UI.
- `chihyuancm.com` is the confirmed shared parent domain for the future public Chihyuan website and internal/business CY-family Web systems; each application keeps its own hostname/origin, deployment and security/session boundary.
- Production custom-domain binding is a controlled rollout step, not an early foundation-development prerequisite.
- Legacy GAS / Google Sheets is behavior/data-semantic reference only; unused test rows are not migrated to production D1.
- Legacy UX is evaluated selectively: useful proven behavior may be retained/adapted, while the new screen structure, component implementation and responsive behavior follow the new Web architecture rather than reproducing GAS.
- Cloudflare Workers is the target application backend and D1 is the live relational database direction.
- Current frontend foundation is TypeScript + React + Vite + Cloudflare Vite plugin.
- Browser business requests use one shared API client/error/request-state foundation rather than per-page fetch conventions.
- Worker APIs use shared response, bounded JSON-request parsing and generic field-validation/error-mapping helpers; domain validation remains inside business modules.
- Shared Identity is consumed through an adapter/service boundary; CY Web does not duplicate the shared account-role hierarchy or credential store.
- CY Web app-local authorization uses `app_members` + app tags/module mappings while shared ADMIN/SUPER_ADMIN authority remains external Identity authority.
- Customer/Item relationships use immutable internal IDs; ERP business numbers are separate values.
- Initial fields follow validated GAS/Legacy business semantics; exact SMART ERP ownership/sync mapping is deferred to the future ERP integration project.
- Formal business records retain only deliberate historical snapshots.
- CY Web uses one shared in-App Audit Core; ordinary edits keep only latest modifier/time and meaningful business events use compact structured Audit.
- Initial AuditService rejects credential-like payload keys, bounds JSON payload size and serves both concise timeline and detailed Admin/SA inspection from the same event store.
- Repeated interaction mechanics are implemented as shared CY Web foundations rather than one copy per business module or one copy per device class.
- Final visual composition/tokens remain a dedicated UI/UX review item; current foundation work establishes reusable behavior and architecture without freezing a GAS-derived look.

## Backup baseline

```text
D1   live authoritative database
R2   daily 03:30 Taiwan / 30-day operational retention
GCS  Wed + Sun replication / 26-week cross-cloud DR retention
```

One logical backup is exported from D1 once. Provider copies use the same `backupId`, payload bytes and integrity metadata.

See `BACKUP_ARCHITECTURE.md`, BD-049 and BD-050.

## Current implementation chain

```text
confirmed Business Decisions
        ↓
Canonical Data Model
        ↓
Final Data Dictionary
        ↓
0001 initial D1 migration
        ↓
local/dev D1 validation
        ↓
Worker + API foundation
        ↓
shared request / validation foundation
        ↓
shared Identity adapter + app-local authorization
        ↓
shared Audit Core
        ↓
cross-module Legacy reusable-pattern audit
        ↓
new-Web UI foundation + shared interaction primitives
        ↓
business modules
        ↓
production custom-domain rollout
        ↓
production acceptance
```

The repository now contains the provider-neutral Identity adapter contract, app-local module-access service, shared AuditService foundation, shared request/validation foundation and initial shared record-editor state foundation. The production shared-Identity browser-session provider contract is still an external dependency, and the production D1 database / production Worker bindings have **not** been created by these branches.

## Document precedence

When architecture documents appear to disagree:

1. current explicit user decision;
2. latest applicable confirmed Business Decision;
3. current specialized architecture/implementation contract;
4. current Canonical Data Model / Data Dictionary as applicable;
5. current workflow/audit summary;
6. archived Legacy evidence.

Do not re-open already confirmed business questions merely because an older draft contains an `OPEN` marker. Check `decisions/README.md` first.
