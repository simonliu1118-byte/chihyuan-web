# CY Web TODO

This file records the current implementation sequence. It is not a permanent rules source.

## Current checkpoint — 2026-09-28

- Active repository: `simonliu1118-byte/chihyuan-web`
- Active implementation branch: `cyweb/operational-local-runtime`
- Active PR: `#41` — Open / Draft / do not merge without explicit user authorization.
- Current version: `0.1.39`.
- Forward UI: the **real integrated React operational application**, not standalone preview pages.
- Current persistence adapter: versioned browser `localStorage`.
- Latest accepted runtime checkpoint: browser TypeScript, Worker TypeScript, Vite build and source/schema validators are green.
- Current migration chain: `0001_initial.sql` + `0002_defect_invalidation.sql`.
- Production D1/Worker/DNS/R2/GCS/SMART ERP are untouched by the operational branch.
- CYAccountingWeb remains a separate workstream and must not be modified here.

Canonical continuation document:

`docs/handoffs/CYWEB_OPERATIONAL_RUNTIME_HANDOFF_2026-09-28.md`

## Immediate sequence

1. [x] Consolidate Governance / Business Decisions / Canonical Data Model / Final Data Dictionary.
2. [x] Implement initial D1 migrations and schema/constraint validation.
3. [x] Stage Worker/API request, validation, Identity adapter and shared Audit foundations.
4. [x] Build the shared AppShell/form/data-view/entity-picker/editable-list/overlay/keyboard foundations.
5. [x] Stage Customer service/persistence/related-record workflows.
6. [x] Stage Item + Defect service/workflow foundations.
7. [x] Stage Sales Work Order workflow foundation.
8. [x] Stage Contractor + BOM + Outsourcing + stock-ledger workflow foundation.
9. [x] Stage WorkLog review/statistics foundation.
10. [x] Stage Settings/Admin authority foundation.
11. [x] Replace disposable module previews with one persistent operational React runtime.
12. [x] Add local JSON export/import/reset and local Audit projection.
13. [x] Add automated TypeScript/Vite/source-contract runtime checks; latest checkpoint is green.
14. [x] Add browser-test packaging for the same operational React runtime.
15. [ ] Continue real-user functional/UI testing directly against the operational React app; make fixes in the same UI rather than returning to standalone previews.
16. [ ] Apply migrations to **local/dev Cloudflare D1** and run D1-specific smoke/transaction acceptance.
17. [ ] Freeze the initial D1 relational schema after real D1 acceptance.
18. [ ] Complete Shared Identity browser-session provider wiring for CY Web.
19. [ ] Add protected Worker business HTTP routes with server-side role/module authorization.
20. [ ] Replace the temporary localStorage persistence adapter with Worker API -> D1 while preserving the same React UI/workflow.
21. [ ] Perform Desktop/Tablet/Mobile real-browser/device acceptance.
22. [ ] Bind/deploy production Worker/D1/custom domain only after explicit production acceptance.

UI polish is continuous and is **not** a prerequisite for beginning D1 integration.

## Operational UI rules already accepted

### General

- Real React screens are the forward implementation path.
- `preview/*` files are reference/history only unless a focused comparison artifact is explicitly needed.
- Functional correctness first; layout/visual corrections are applied continuously to the same operational UI.
- Normal business text must remain readable; avoid micro-text. Current accepted baseline is approximately 14–16px for ordinary content.
- Long forms should keep important Cancel/Save controls reachable at both top and bottom.

### Customer

- Search/filter/result count/result list belong together in the **left Search Pane**.
- Selected Customer detail is an independent **right Detail Pane**.
- Left/right major card top edges should align.
- Result columns must remain stable even when labels have different Chinese-character lengths; one field must not push another sideways.
- Header Edit is compact/single-line rather than a tall multi-row action block.
- Delete/Deactivate is a secondary lifecycle action rather than increasing the Edit button height.
- Existing ERP Customer number is not silently changed by ordinary editing; assignment/correction is a controlled action.
- Duplicate Tax ID is allowed only after an explicit warning/confirmation.
- Related-record visual detail is intentionally deferred for a later concentrated pass.

## Module state

### Customer

Current operational/service scope includes:

- Customer master create/edit;
- phones / contacts / addresses / important notes;
- ERP Customer-number assignment/correction;
- active/inactive lifecycle;
- duplicate Tax-ID warning path;
- Visits;
- Frequent Items;
- Customer + Item Quote history/correction;
- important activity/Audit.

Next: keep testing/fixing the real operational screen, then wire protected API/D1 after runtime/Identity gates.

### Item + Defect

Current scope includes:

- Item master;
- scaled4 commercial values;
- unit conversion graph;
- historical Item-number search;
- controlled audited Item-number change;
- Defect `created -> processing -> resolved`;
- resolved reopen;
- created-only hard delete boundary;
- invalidation overlay without creating a fourth workflow status.

### Sales Work Order

Current lifecycle baseline:

```text
created
  -> first ERP fill
issued
  -> waiting_stock (optional)
  -> picked
  -> shipped
```

Also staged: direct `issued -> picked`, ERP reference correction, controlled shipment reversal, post-ERP voiding and pre-ERP-only hard-delete rules.

### Contractor / BOM / Outsourcing

Current scope includes:

- Contractor master/current Contractor Price;
- multiple BOM variants;
- pending outbound planning;
- confirmed outbound stock movement;
- outbound correction by reversal + replacement;
- cancel/void;
- receiving + BOM consumption;
- cancel receiving;
- pricing/cancel pricing;
- payment/cancel payment;
- movement-derived contractor stock.

Critical rule:

```text
pending_outbound = plan only
confirmed outbound = actual contractor stock movement
```

### WorkLog

Current scope includes:

- create/edit while `created`;
- independent Work Days;
- submit/withdraw review;
- reviewer scoring;
- reviewer Work Days correction;
- per-entry remark/score;
- finalized total/average-daily score;
- cancel review back to `pending_review`;
- historical statistics from stored finalized results.

Chihyuan production WorkLog categories/platforms/scoring values remain deployment D1 configuration, not Public-source constants.

### Settings / Admin / Audit

Current authority foundation:

- departments/customer categories/customer statuses/item categories: `SUPER_ADMIN` mutation only;
- App Tags/module mappings/member-tag assignments: `SUPER_ADMIN` mutation only;
- WorkLog operational configuration: `ADMIN` or `SUPER_ADMIN`;
- regular `EMPLOYEE`: no configuration mutation authority;
- meaningful configuration changes create shared Audit.

Protected Settings/Admin/Audit HTTP access still waits for Shared Identity browser-session wiring.

## D1 / Worker acceptance

### Already complete

- [x] `migrations/` is the forward schema source of truth.
- [x] `0001_initial.sql` implemented.
- [x] `0002_defect_invalidation.sql` implemented.
- [x] SQLite schema/constraint validation.
- [x] Worker TypeScript compile at latest accepted runtime checkpoint.
- [x] Browser TypeScript/Vite build at latest accepted runtime checkpoint.

### Still required before schema freeze

- [ ] Apply migrations to local/dev Cloudflare D1.
- [ ] Run Worker against local/dev D1.
- [ ] Test optimistic revision conflicts against D1.
- [ ] Test Audit + business mutation transactional behavior.
- [ ] Test exact fixed-point persistence/conversion behavior.
- [ ] Test Outsourcing reversal/replacement and WorkLog review/cancel-review transitions.
- [ ] Confirm D1-specific constraints/transaction semantics.
- [ ] Mark initial schema frozen only after those checks pass.

The schema is stable enough for UI/product work and early D1 integration. Do not redesign it merely because screen layout changes.

## Shared Identity

Already staged:

- [x] provider-neutral Identity adapter;
- [x] normalized principal contract;
- [x] shared role hierarchy `EMPLOYEE / ADMIN / SUPER_ADMIN`;
- [x] CY Web-local app tags/module access projection.

Still required:

- [ ] concrete Shared Identity browser-session provider for CY Web;
- [ ] authenticated client session/menu state;
- [ ] protected Worker-route server authorization;
- [ ] integration acceptance before multi-user D1 operation.

Do not create a second CY Web credential/session system or copy CYInvoice auth internals as a shortcut.

## Browser-test runtime

Operational browser build command:

```text
npm run build:operational
```

The operational packaging workflow publishes the built static package to:

```text
cyweb/operational-test-runtime
```

and also produces an `operational-runtime` GitHub Actions artifact when Actions capacity is available.

The package uses the same React operational app with localStorage persistence. It is not a production deployment.

## Backup / recovery

Canonical detail: `docs/architecture/BACKUP_ARCHITECTURE.md`.

Confirmed architecture:

```text
D1   live authoritative database after cutover
R2   daily 03:30 Taiwan / 30-day operational retention
GCS  Wed + Sun replication / 26-week cross-cloud DR retention
```

Already prepared:

- [x] R2 account activation.
- [x] Separate CY Web / CYAccountingWeb production R2 buckets.
- [x] 45-day bucket lifecycle safety guard behind 30-day application retention.
- [x] CY Web production GCS bucket + least-privilege service identity.
- [x] Provider-neutral BackupService / BackupStorageProvider architecture.

Still later:

- [ ] bind CY Web runtime R2/GCS only after real Worker deployment boundary is accepted;
- [ ] implement backup-set builder/providers/catalog/retention;
- [ ] implement SA-only backup/list/verify/restore API/UI/Audit;
- [ ] run restore and cross-cloud DR drills.

## Domain baseline

- `chihyuancm.com` — official public site.
- `admin.chihyuancm.com` — CY Web.
- `accounting.chihyuancm.com` — CYAccountingWeb.
- `invoice.chihyuancm.com` — CYInvoice Web.
- `auth.chihyuancm.com` — future Shared Identity.
- `portal.chihyuancm.com` — future unified entry if needed.

Actual custom-domain binding remains a controlled production rollout step.

## Continuation checklist

A new CY Web conversation should first read:

1. `docs/handoffs/CYWEB_OPERATIONAL_RUNTIME_HANDOFF_2026-09-28.md`
2. `docs/architecture/README.md`
3. this `TODO.md`
4. `docs/architecture/OPERATIONAL_LOCAL_RUNTIME.md`
5. `docs/architecture/decisions/README.md` plus relevant module Business Decisions.

Do not re-open settled Business Decisions unless the user explicitly changes them.
