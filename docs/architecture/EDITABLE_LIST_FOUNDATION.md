# CY Web Editable List Foundation

> Status: shared state/interaction contract before production line-item editors.

## Purpose

Sales Work Order lines, Outsourcing outbound/receiving/pricing rows, Quote price breaks and WorkLog structured rows all need repeated multi-row editing mechanics.

The Legacy application implemented these separately. CY Web must share the common mechanics while keeping each module's business fields and calculations domain-specific.

## Initial shared state model

`editable-list.ts` provides immutable row-list state with:

- stable local row keys;
- load/reset/commit lifecycle;
- add;
- update;
- remove;
- reorder/move;
- per-row field-error bags;
- dirty state;
- serialization back to domain values.

This state can participate in the existing record-editor dirty/unsaved-change protection instead of each page maintaining independent booleans.

## Row identity

Editable UI row identity is not the same thing as a business database ID.

Existing persisted rows may use an appropriate stable domain-derived key. New unsaved rows should receive a stable local key when created so React rendering, validation and keyboard focus do not depend on array index.

The same key must remain attached to the row while it is edited/reordered.

## Immutability contract

Row values are treated as immutable values.

Business modules must replace a row value through the reducer's `update` action rather than mutating nested objects in place. This keeps baseline/reset/dirty behavior predictable without forcing the generic foundation to deep-clone unknown domain objects.

## Validation boundary

The shared list stores/display-targets row error bags but does not decide business validity.

Examples owned by domain modules:

- quantity must be positive;
- selected unit must be valid for the Item;
- receiving quantity cannot violate an Outsourcing rule;
- WorkLog row requirements;
- price calculations and rounding.

Server validation remains authoritative when the record is saved.

## Presentation boundary

This stage intentionally does **not** force one universal visual grid component onto every workflow.

The common state/operations are frozen first. Desktop may later compose them into a dense editable table while Mobile may use focused row cards/editors. Both presentations must consume the same shared list state and domain rules.

This avoids repeating Legacy's per-page implementations without creating an over-generalized UI that makes different workflows harder to use.

## Keyboard / focus direction

Stable row keys and shared operations are prerequisites for later shared keyboard progression/focus helpers. Page-specific document-level Enter handlers are still prohibited; keyboard behavior belongs in the shared field/grid interaction layer.

## Relationship to other foundations

```text
Record Editor
  └─ owns record create/view/edit/save/cancel

Editable List
  └─ owns repeated-row state inside that record
      ├─ Entity Picker may provide Customer/Item/etc. cells
      ├─ shared form controls render fields
      └─ unsaved-change guard sees combined dirty state
```

## Non-goals

Not fixed yet:

- exact Sales Order columns;
- exact Outsourcing row layout;
- drag-and-drop;
- spreadsheet-style cell navigation;
- virtualization;
- bulk paste;
- final Desktop/Mobile visual composition.

Those should be implemented only after the first real domain editor proves the interaction requirement.
