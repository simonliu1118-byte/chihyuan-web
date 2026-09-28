# CY Web Main Baseline Handoff — 2026-09-28

> Purpose: post-merge continuation checkpoint for CY Web after the operational runtime stack was consolidated into `main`.
>
> This document supersedes pre-merge branch/PR status in `CYWEB_OPERATIONAL_RUNTIME_HANDOFF_2026-09-28.md`. That earlier handoff remains valid as implementation-history evidence for the operational-runtime checkpoint, but its references to an active PR/branch are historical after the merge described here.

## 1. Current repository baseline

- Repository: `simonliu1118-byte/chihyuan-web`
- Current canonical implementation baseline: `main`
- Application version: `0.1.39`
- Integration PR: `#42` — merged on 2026-09-28.
- Main merge commit: `bea60a5b1fed5ed9283bb00c1ced4ca27c0ae9f0`.
- Pre-merge operational development PR `#41` is superseded by the merged integration baseline.
- Governance Check for the integration head: **PASS** (`run #98`).
- Runtime Check for the integration head: **PASS** (`run #60`).

The consolidated baseline contains the real integrated React operational runtime plus the staged architecture/service/module foundations accumulated through the earlier stacked development branches.

## 2. Forward product/runtime direction

The forward application surface remains the real integrated React UI. Do not return to disposable standalone module previews.

Current persistence mode remains versioned browser `localStorage` for repeated functional/UI testing. This is a temporary persistence adapter, not a competing domain model.

The target remains:

```text
React operational UI
      ↓
Worker protected API
      ↓
D1
```

D1 cutover is an adapter/runtime change. It must preserve the same operational UI and confirmed business workflows rather than triggering a rewrite.

## 3. Current accepted implementation state

Integrated/staged scope includes:

- Customer master and related Visit / Quote / Frequent Item workflows;
- Item master, unit conversions, number history/change and Defect lifecycle;
- Sales Work Order pre-ERP / ERP / fulfillment workflow;
- Contractor / BOM / Outsourcing / contractor-stock movement workflow;
- WorkLog entry / review / statistics workflow;
- Settings / Admin authority foundation;
- shared Audit foundation;
- Shared Identity adapter boundary;
- common AppShell, forms, Data View, Entity Picker, editable-list, overlay/feedback and keyboard-entry foundations;
- operational browser packaging using the same React runtime.

Current migration chain:

```text
0001_initial.sql
0002_defect_invalidation.sql
```

SQLite/source/schema validation, browser TypeScript, Worker TypeScript and Vite build were green at the integration checkpoint.

## 4. Immediate next sequence

Continue from `main` unless a new scoped branch is created for the next work item.

1. Continue real-user functional/UI testing directly against the operational React runtime.
2. Apply the current migrations to **local/dev Cloudflare D1**.
3. Run Worker + D1 runtime smoke/transaction acceptance, including critical constraints, fixed-point behavior, optimistic revision, Audit and reversal workflows.
4. Freeze the initial relational schema only after real D1 acceptance passes.
5. Complete the concrete Shared Identity browser-session provider for CY Web.
6. Add protected Worker business HTTP routes with server-side role/module authorization.
7. Replace the temporary localStorage persistence adapter with Worker API -> D1 while keeping the same React UI/workflow.
8. Perform Desktop / Tablet / Mobile real-browser/device acceptance.
9. Bind/deploy production Worker / D1 / custom domain only after explicit production acceptance.

UI polish remains continuous and does not block beginning local/dev D1 integration.

## 5. Production/infrastructure safety

The 0.1.39 integration merge did **not** modify:

- production D1 data;
- production CY Web Worker binding/deployment;
- production DNS/custom domain;
- production R2/GCS backup resources;
- SMART ERP;
- CYAccountingWeb source/runtime.

Backup architecture remains D1 live -> R2 operational backup -> GCS cross-cloud DR, with runtime binding/implementation still a later controlled step for CY Web.

## 6. Continuation reading order

For a new CY Web conversation, read at minimum:

1. this handoff;
2. `docs/architecture/README.md`;
3. `TODO.md`;
4. `docs/architecture/OPERATIONAL_LOCAL_RUNTIME.md`;
5. `docs/architecture/decisions/README.md` and applicable module Business Decisions.

When older 2026-09-28 documents refer to PR `#41` as active or the operational branch as the current integration target, treat those references as pre-merge checkpoint metadata. The current canonical code baseline is `main` at or after merge commit `bea60a5b1fed5ed9283bb00c1ced4ca27c0ae9f0`.

Do not reopen settled Business Decisions unless the user explicitly changes them.
