# CY Web Item Full Workspace Preview

> Status: browser-local functional review gate for Item + Defect before protected API wiring.

## Purpose

Following the Customer review strategy, Item is reviewed first as one integrated workflow rather than as disconnected component demos. The priority is functional correctness and workflow coherence; visual polish remains secondary.

Preview file:

`preview/item/full-workspace-v1.html`

## Included workflow

- Item search/filter/select;
- search by current or previous Item number;
- Item create/register using an existing SMART ERP Item number;
- Item ordinary edit;
- top and bottom Cancel/Save actions for long edit forms;
- active/inactive state;
- cost/store/clinic decimal inputs;
- unit-conversion row editing;
- conversion graph validation including unresolved targets and cycles;
- dedicated controlled Item-number change;
- previous Item-number history;
- Item-context Defect list;
- Defect create/edit;
- `created -> processing -> resolved` explicit actions;
- explicit resolved-case reopen;
- created-only hard delete;
- processing/resolved invalidation while retaining the record;
- optional display of invalidated records.

## Readability baseline

The preview starts with the readability correction already accepted during Customer review:

- normal business data approximately 14–16px;
- secondary information generally 13px;
- form controls approximately 15px;
- no normal business-reading surface built around 10–12px micro-text.

## Business semantics represented

The preview deliberately preserves these production boundaries even though it uses only browser memory:

- CY Web does not generate a SMART ERP Item number;
- ordinary edit cannot change an existing Item number;
- Item-number change retains prior number history;
- old Item number remains searchable;
- quantity/unit-price/cost inputs support up to four decimal places;
- unit conversion chains must resolve to the base unit;
- resolved Defect records must be reopened before edit;
- handled Defect records are invalidated rather than hard-deleted when the record itself was wrong;
- invalidation is not a fourth workflow status.

## Preview simplifications

- sample users are treated as authorized for lifecycle testing;
- timestamps are deterministic/example values;
- browser `confirm` / `prompt` may be used for some lifecycle-review interactions;
- no actual Audit/D1 transaction occurs; the production service foundation owns that behavior;
- reload resets all sample state.

These simplifications are testing scaffolding, not final production UX.

## Runtime boundary

The preview does not expose protected Item/Defect HTTP routes, does not bind production D1, and does not bypass Shared Identity. Production integration still waits for the existing Identity and local/dev Worker+D1 acceptance gates.
