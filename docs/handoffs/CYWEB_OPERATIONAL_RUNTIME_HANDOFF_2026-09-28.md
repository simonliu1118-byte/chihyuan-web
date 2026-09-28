# CY Web Operational Runtime Handoff — 2026-09-28

> Purpose: continuation checkpoint for the next CY Web working conversation.
>
> This document records the current implementation state, accepted direction, runtime gates and exact next steps. It does not replace Governance, Business Decisions, the Final Data Dictionary or module contracts.

## 1. Current working state

- Repository: `simonliu1118-byte/chihyuan-web`
- Active implementation branch: `cyweb/operational-local-runtime`
- Active PR: `#41` — `feat: replace static previews with persistent operational local runtime`
- PR state at this checkpoint: Open, Draft, mergeable; **do not merge without explicit user authorization**.
- Current application version: `0.1.39`.
- Current branch head when this handoff was prepared: `20a1b480ab4370153421cf846d4eee4ae2865e03`.
- Runtime Check on that head: **PASS** (`run #51`, conclusion `success`).

The current development direction is no longer disposable module previews. The React application itself is the testable product surface.

## 2. User-confirmed development direction

The user explicitly wants:

```text
real operational UI first
        ↓
use it directly and find problems
        ↓
fix the same real UI in place
        ↓
connect D1 when useful / ready
```

The user does **not** want a throwaway mock that is later rewritten.

Functional correctness is the priority. UI is refined continuously while the same operational version is being used.

Standalone `preview/*` files are now reference/history artifacts only unless a focused comparison artifact is specifically requested.

## 3. Current persistence mode

The operational React app currently persists test data in versioned browser `localStorage`.

This is a temporary persistence adapter, not a second domain model.

Current behavior:

- reload retains test data;
- modules share one local dataset;
- cross-module records use stable numeric IDs;
- important workflow actions append local Audit records;
- full JSON export/import is available;
- explicit reset restores fictional seed data;
- production/development D1 is not written in this mode.

The authoritative target remains:

```text
React operational UI
      ↓
Worker protected API
      ↓
D1
```

The existing D1 schema, Final Data Dictionary and Worker service contracts remain authoritative during the cutover.

## 4. Runtime/CI acceptance at this checkpoint

The previous red checks were cleared. The latest Runtime Check is green.

Current accepted automated gates include:

- browser TypeScript typecheck;
- Worker TypeScript typecheck;
- Vite operational/application build;
- source/schema contract validators across Customer, Item, Defect, Sales Work Order, Contractor/Outsourcing, WorkLog, Settings/Admin and the operational local runtime.

Two forward migrations currently form the schema chain:

- `0001_initial.sql`;
- `0002_defect_invalidation.sql`.

SQLite-based schema/contract validation is green. **Actual local/dev Cloudflare D1 migration + Worker/D1 runtime smoke acceptance is still pending and is the remaining schema-freeze gate.**

## 5. Browser-test packaging

`.github/workflows/operational-live.yml` builds the same operational React runtime with:

```text
npm run build:operational
```

and publishes the built static package to the branch:

```text
cyweb/operational-test-runtime
```

It also uploads a 30-day `operational-runtime` Actions artifact and stamps the source commit into `SOURCE_COMMIT`.

This package is for direct browser testing of the real UI while persistence is still local. It is not a production Worker deployment and does not imply protected D1/API access.

## 6. Integrated module state

### Customer

Operational UI is active in the real React runtime.

Implemented/staged business behavior includes:

- Customer master create/edit;
- multiple phones, contacts, addresses and important notes;
- controlled ERP Customer-number assignment/correction;
- category/status/region/owner reference handling;
- active/inactive lifecycle;
- duplicate Tax-ID explicit warning path;
- Visits;
- Frequent Items;
- Customer + Item Quote history/correction semantics;
- important activity/Audit projection.

Accepted Customer UI baseline from browser review:

- Search/filter/results belong entirely in the left Search Pane;
- Detail is an independent right pane;
- left/right card top alignment must be visually aligned;
- result columns must not shift because one label has an extra Chinese character;
- normal business text uses a readable approximately 14–16px baseline rather than micro-text;
- view-header action buttons use compact single-line height;
- edit mode provides Cancel/Save both at the top and bottom so short edits do not require scrolling to the bottom;
- delete/deactivate can occupy the secondary action position below/near Edit as appropriate.

Detailed related-record visual polish remains intentionally open for later concentrated UI review.

### Item + Defect

Operational UI and service foundations are staged for:

- Item master;
- exact scaled4 commercial values;
- unit conversion graph;
- historical Item numbers;
- controlled audited Item-number change;
- Defect create/edit lifecycle;
- `created -> processing -> resolved`;
- resolved reopen;
- created-only hard delete boundary;
- post-handling invalidation overlay without inventing a fourth workflow status.

### Sales Work Order

The integrated operational flow supports the staged contract:

```text
created
  -> first ERP fill
issued
  -> waiting_stock (optional)
  -> picked
  -> shipped
```

Also staged:

- direct `issued -> picked`;
- ERP Customer/ERP number fill/correction;
- controlled shipment reversal `shipped -> picked`;
- post-ERP voiding;
- hard delete only for pre-ERP created records under explicit permission.

### Contractor / BOM / Outsourcing

Staged operational behavior includes:

- Contractor master/current Contractor Price;
- multiple BOM variants;
- pending outbound plan;
- confirmed outbound stock movement;
- outbound correction by reversal + replacement rather than destructive balance rewriting;
- cancellation/void rules;
- receiving with explicit BOM selection;
- BOM-driven material consumption;
- cancel receiving;
- pricing/cancel pricing;
- payment/cancel payment;
- movement-derived contractor stock.

Critical stock timing rule remains:

```text
pending_outbound = plan only
confirmed outbound = actual contractor stock movement
```

### WorkLog

Staged operational behavior includes:

- create/edit while `created`;
- Work Days independent from calendar interval;
- submit review;
- owner withdraw;
- reviewer scoring;
- reviewer Work Days correction;
- per-entry remark/score;
- finalized total and average daily score;
- cancel review back to `pending_review`;
- historical statistics from stored finalized results.

Production WorkLog categories/platforms/scoring values remain deployment D1 configuration, not Public-source constants.

### Settings / Admin / Audit

Server-side authority foundation is staged:

- structural lookups: Super Admin only;
- App Tags/module mappings/member tag assignments: Super Admin only;
- WorkLog operational configuration: Admin or Super Admin;
- structured Audit for meaningful configuration changes;
- local operational Settings can change test choices and import/export/reset the local dataset.

Real protected Settings/Admin/Audit HTTP access remains blocked on Shared Identity browser-session wiring.

## 7. Shared Identity boundary

CY Web must reuse Shared Identity and must not create a second credential system.

Already staged:

- provider-neutral Identity adapter;
- normalized principal contract;
- shared role hierarchy `EMPLOYEE / ADMIN / SUPER_ADMIN`;
- CY Web app-local tags/module access mapping.

Still required before real multi-user D1 operation:

- concrete Shared Identity browser-session provider compatible with CY Web;
- server-side protected route authorization;
- authenticated client session/menu state.

Do not copy CYInvoice credentials/session internals into CY Web as a shortcut.

## 8. D1/schema state

The logical/relational architecture is considered stable enough to continue product work, but formal freeze still requires real D1 acceptance.

Do not redesign the schema merely because UI layout changes.

Before declaring schema frozen:

1. apply all migrations to local/dev D1;
2. run D1-specific smoke checks for critical constraints and transactional workflows;
3. run Worker against that D1;
4. confirm fixed-point, optimistic revision, Audit and reversal workflows;
5. only then mark the initial schema freeze complete.

The user is comfortable connecting D1 during UI testing if it is useful. Therefore D1 cutover may begin before UI is visually final, as long as the same real React UI remains the forward surface.

## 9. Immediate next sequence

Continue from this checkpoint in this order unless the user redirects:

1. **Keep PR #41 / operational React as the forward implementation.** Do not return to standalone previews.
2. Give the user a directly testable operational build from the `cyweb/operational-test-runtime` publication path/artifact.
3. Fix functional and UI issues directly in the operational React modules as the user reports them.
4. Keep localStorage format backward-compatible where practical; before an incompatible local format change, provide migration or export/reset/import handling.
5. Run local/dev D1 migrations and Worker+D1 smoke acceptance.
6. Freeze the initial schema once D1-specific acceptance passes.
7. Complete Shared Identity browser-session integration.
8. Replace the temporary local persistence adapter with protected Worker API -> D1 while keeping the same UI/workflow.
9. Then perform Desktop/Tablet/Mobile real-browser/device acceptance and production-domain rollout.

UI polish is continuous, not a prerequisite for D1 cutover.

## 10. Production/infrastructure safety

At this checkpoint the operational branch has **not** modified:

- production D1 data;
- production CY Web Worker binding/deployment;
- production DNS/custom domain;
- production R2/GCS backup resources;
- SMART ERP;
- CYAccountingWeb source/runtime.

The CYAccountingWeb workstream remains separate. Do not modify it from this CY Web workstream.

## 11. Domain baseline

Confirmed namespace remains:

- `chihyuancm.com` — public official site;
- `admin.chihyuancm.com` — CY Web;
- `accounting.chihyuancm.com` — CYAccountingWeb;
- `invoice.chihyuancm.com` — CYInvoice Web;
- `auth.chihyuancm.com` — future Shared Identity;
- `portal.chihyuancm.com` — future unified entry if needed.

Actual custom-domain binding remains a later controlled rollout step.

## 12. Continuation rule

When a new conversation resumes CY Web work, read at minimum:

1. this handoff;
2. `docs/architecture/README.md`;
3. `TODO.md`;
4. `docs/architecture/OPERATIONAL_LOCAL_RUNTIME.md`;
5. `docs/architecture/decisions/README.md` and applicable module BD files.

Do not re-open already settled Business Decisions unless the user explicitly changes them.
