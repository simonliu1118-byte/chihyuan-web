# CY Web Pre-Business Implementation Readiness

> Status: shared-foundation gate review before the first production business module.
>
> This review checks whether the confirmed repeated Legacy interaction needs have a reusable CY Web foundation. It does not freeze final visual design and does not waive runtime, Identity, D1 or user-facing UI review gates.

## 1. Purpose

Before Customer becomes the first real business module, CY Web should not repeat the Legacy pattern of solving the same interaction separately inside every module.

This review compares:

- confirmed Business Decisions through BD-056;
- `LEGACY_REUSABLE_PATTERN_AUDIT.md`;
- `UI_FOUNDATION.md` implementation gate;
- the reusable source already staged in the current branch chain.

The result distinguishes three states:

- **READY** — reusable foundation exists and may be consumed by business modules;
- **DEFER TO FIRST REAL USE** — the concern is understood, but prebuilding a generic abstraction now would be premature;
- **EXTERNAL / RUNTIME GATE** — required before protected production APIs or production deployment, but not a missing UI abstraction.

## 2. Shared-foundation matrix

| Repeated concern | Current CY Web foundation | Status | Business-module rule |
| --- | --- | --- | --- |
| App frame / navigation structure | `AppShell`, data-driven navigation groups | READY | Modules compose inside the shared shell; no private page frame. |
| Record create/view/edit lifecycle | shared record-editor state | READY | Domain code adds business actions only. |
| Unsaved-change protection | shared browser/in-app unsaved guard | READY | Drawer/Sheet/page navigation reuses the same dirty-state contract. |
| API request/error/cache behavior | shared API client + request-state contract | READY | No page-local fetch/error envelope conventions. |
| Form labels/help/errors | shared field primitives | READY | Domain validation may add rules, not duplicate field presentation. |
| Search/filter/results | `DataViewToolbar` + `DataView` | READY | Domain supplies query/filter/column/card definitions. |
| Desktop table / Mobile card projection | shared adaptive `DataView` | READY | Same query/data state backs both presentations. |
| Pagination | shared neutral previous/next pagination contract | READY | Concrete API may use cursor semantics without changing UI mechanics. |
| Entity lookup/autocomplete | generic async `EntityPicker<T>` | READY | Customer/Item/Contractor adapters supply endpoint and display semantics. |
| Editable repeated rows | shared immutable editable-list state | READY | Order/Quote/Outsourcing/WorkLog define their own rows and calculations. |
| Dialog / Drawer / Bottom Sheet | shared overlay foundation | READY | High-risk flows may layer stricter Business Decision safeguards. |
| Confirmation | shared normal/danger confirmation dialog | READY | Server authorization remains authoritative. |
| Routine success feedback | shared non-blocking Toast queue/region | READY | Do not recreate blocking GAS success/refresh prompts. |
| Enter-to-next-field workflow | opt-in shared Enter-advance helper | READY | Only proven data-entry fields opt in; Tab and component keyboard semantics remain authoritative. |
| Status visual treatment | shared `StatusChip` primitive | READY | Each domain owns state machine and transitions. |
| Related-record presentation | shared `Section` + adaptive `DataView` composition | READY | Create a separate wrapper only if real Customer/Item use proves repeated extra behavior. |
| Unit picker / conversion display | known repeated requirement | DEFER TO FIRST REAL USE | Implement with Item/Order when actual conversion behavior is present; do not invent a generic financial/unit engine now. |
| Concise Audit timeline UI | Audit data/service contract exists | DEFER TO FIRST REAL USE | Build the timeline component against the first real record/API shape; do not expose raw detailed payloads in normal screens. |
| Admin/SA detailed Audit viewer | shared AuditService detailed query exists | DEFER TO ADMIN USE | Requires protected authenticated API + Admin/SA screen; not a Customer-screen blocker. |
| Client permission/menu visibility | server module-access model exists | EXTERNAL / RUNTIME GATE | Concrete browser-session state must come from Shared Identity. Hiding UI never replaces server authorization. |
| Protected API route guard | `requireIdentity` / module-access foundation staged | EXTERNAL / RUNTIME GATE | First authenticated business route waits for the Shared Identity browser-session provider contract. |
| Local/dev Worker + real D1 smoke | source/config + SQLite validation staged | EXTERNAL / RUNTIME GATE | Run npm/typecheck/build, Wrangler local migration and Worker/D1 smoke in a normal networked checkout before schema/runtime acceptance. |
| Final visual composition | architecture only, styles provisional | USER/UI REVIEW GATE | First Customer visual composition is reviewed as new CY Web design; Legacy is workflow evidence only. |

## 3. UI Foundation gate result

The structural implementation gate in `UI_FOUNDATION.md` is satisfied for beginning **Customer module design and domain-contract work**:

1. shared UI layer boundaries exist;
2. shared API client/request-state exists;
3. record-editor + dirty guard exists;
4. shared loading/error/feedback/overlay primitives exist;
5. searchable adaptive data-view exists;
6. generic entity-picker exists;
7. editable-list mechanics exist before modules that need them;
8. one-codebase Desktop/Tablet/Mobile adaptation is the current architecture;
9. final visual composition remains intentionally subject to user review.

This does **not** mean protected Customer APIs may be deployed yet. Identity browser-session wiring and local/dev D1/Worker acceptance remain separate runtime gates.

## 4. What we intentionally do not prebuild

To avoid replacing one kind of duplication with an oversized framework, the following are not implemented generically until a real workflow proves the abstraction:

- one universal business workflow/state engine;
- one universal unit/price calculation engine;
- one universal related-record wrapper beyond existing Section + DataView composition;
- speculative Customer/Item/Order screen layouts;
- a generic detailed Audit screen before authenticated Admin/SA API wiring;
- per-module browser caches containing complete D1 master datasets.

## 5. First business-module direction

Customer is the first module because it establishes the main reusable master-record pattern and is a dependency for Visits, Quote history, Frequent Items and later Sales Work Order customer selection.

The next safe implementation step is:

1. define the Customer module contract from confirmed decisions and the Final Data Dictionary;
2. define search/list/detail/edit/child-record API shapes without provider-specific Identity coupling;
3. prepare Customer-specific domain validation and query boundaries;
4. keep actual protected route wiring behind the Shared Identity session gate;
5. review the first Customer Desktop/Tablet/Mobile composition with the user before treating the visual layout as final.

## 6. Non-regression rules for business modules

Once business implementation begins:

- a module must consume the shared foundation before adding a private equivalent;
- module-specific exceptions stay narrow and explicit;
- no separate Desktop/Mobile business logic trees;
- no GAS-style full-dataset preload requirement;
- no blocking routine-success alerts;
- no relationship created from free-typed entity text without explicit selection;
- no client-side permission check treated as authoritative;
- no ordinary CRUD event spam in Audit.
